import { HTTP_STATUS, apiError, apiResponse } from '@/lib/api/response'
import { requireOwner } from '@/lib/auth/api-auth'
import { prisma } from '@/lib/database/prisma'
import { loggers } from '@/lib/logger'
import { normalizePath } from '@/lib/utils'

const logger = loggers.files

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string[] }> }
) {
  try {
    const { response } = await requireOwner()
    if (response) return response

    const { id } = await params
    const folderPath = normalizePath('/' + id.map(decodeURIComponent).join('/'))

    const folder = await prisma.folder.findUnique({
      where: { id: folderPath },
      include: {
        members: {
          include: {
            user: {
              select: { id: true, name: true, email: true, role: true, image: true },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    })

    if (!folder) {
      return apiError('Folder not found', HTTP_STATUS.NOT_FOUND)
    }

    return apiResponse({
      folderId: folder.id,
      visibility: folder.visibility,
      ownerId: folder.userId,
      members: folder.members.map((m) => ({
        id: m.user.id,
        name: m.user.name,
        email: m.user.email,
        role: m.user.role,
        image: m.user.image,
        addedAt: m.createdAt.toISOString(),
      })),
    })
  } catch (error) {
    logger.error('Error listing folder members', error as Error)
    return apiError('Failed to list members', HTTP_STATUS.INTERNAL_SERVER_ERROR)
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string[] }> }
) {
  try {
    const { response } = await requireOwner()
    if (response) return response

    const { id } = await params
    const folderPath = normalizePath('/' + id.map(decodeURIComponent).join('/'))

    const body = await request.json()
    const { userId } = body

    if (!userId || typeof userId !== 'string') {
      return apiError('userId is required', HTTP_STATUS.BAD_REQUEST)
    }

    const folder = await prisma.folder.findUnique({ where: { id: folderPath } })
    if (!folder) {
      return apiError('Folder not found', HTTP_STATUS.NOT_FOUND)
    }

    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) {
      return apiError('User not found', HTTP_STATUS.NOT_FOUND)
    }

    await prisma.folderMember.upsert({
      where: { folderId_userId: { folderId: folderPath, userId } },
      update: {},
      create: { folderId: folderPath, userId },
    })

    // Auto-mark the folder as TEAM whenever it has members
    if (folder.visibility !== 'TEAM') {
      await prisma.folder.update({
        where: { id: folderPath },
        data: { visibility: 'TEAM' },
      })
    }

    return apiResponse({ success: true })
  } catch (error) {
    logger.error('Error adding folder member', error as Error)
    return apiError('Failed to add member', HTTP_STATUS.INTERNAL_SERVER_ERROR)
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string[] }> }
) {
  try {
    const { response } = await requireOwner()
    if (response) return response

    const { id } = await params
    const folderPath = normalizePath('/' + id.map(decodeURIComponent).join('/'))

    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')

    if (!userId) {
      return apiError('userId query param is required', HTTP_STATUS.BAD_REQUEST)
    }

    await prisma.folderMember.deleteMany({
      where: { folderId: folderPath, userId },
    })

    // If no members left, revert visibility back to PUBLIC
    const remaining = await prisma.folderMember.count({
      where: { folderId: folderPath },
    })
    if (remaining === 0) {
      await prisma.folder.update({
        where: { id: folderPath },
        data: { visibility: 'PUBLIC' },
      })
    }

    return apiResponse({ success: true })
  } catch (error) {
    logger.error('Error removing folder member', error as Error)
    return apiError('Failed to remove member', HTTP_STATUS.INTERNAL_SERVER_ERROR)
  }
}
