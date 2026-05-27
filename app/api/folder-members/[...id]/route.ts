import { HTTP_STATUS, apiError, apiResponse } from '@/lib/api/response'
import { requireAuth } from '@/lib/auth/api-auth'
import { prisma } from '@/lib/database/prisma'
import { loggers } from '@/lib/logger'
import { normalizePath } from '@/lib/utils'

const logger = loggers.files

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string[] }> }
) {
  try {
    const auth = await requireAuth(request)
    if (auth.response) return auth.response

    const { id } = await params
    const folderPath = normalizePath('/' + id.map(decodeURIComponent).join('/'))

    const folder = await prisma.folder.findFirst({
      where: { id: { equals: folderPath, mode: 'insensitive' } },
      include: {
        user: {
          select: { id: true, name: true, email: true, role: true, image: true },
        },
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

    const isOwner = auth.user.id === folder.userId
    const isSystemOwner = auth.user.role === 'OWNER'

    if (!isOwner && !isSystemOwner) {
      return apiError('Unauthorized', HTTP_STATUS.UNAUTHORIZED)
    }

    return apiResponse({
      folderId: folder.id,
      visibility: folder.visibility,
      ownerId: folder.userId,
      teamLeaderId: folder.teamLeaderId,
      owner: folder.user ? {
        id: folder.user.id,
        name: folder.user.name,
        email: folder.user.email,
        role: folder.user.role,
        image: folder.user.image,
      } : null,
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
    const auth = await requireAuth(request)
    if (auth.response) return auth.response

    const { id } = await params
    const folderPath = normalizePath('/' + id.map(decodeURIComponent).join('/'))

    const folder = await prisma.folder.findFirst({ where: { id: { equals: folderPath, mode: 'insensitive' } } })
    if (!folder) {
      return apiError('Folder not found', HTTP_STATUS.NOT_FOUND)
    }

    const resolvedPath = folder.id

    const isOwner = auth.user.id === folder.userId
    const isSystemOwner = auth.user.role === 'OWNER'

    if (!isOwner && !isSystemOwner) {
      return apiError('Unauthorized', HTTP_STATUS.UNAUTHORIZED)
    }

    const body = await request.json()
    const { userId } = body

    if (!userId || typeof userId !== 'string') {
      return apiError('userId is required', HTTP_STATUS.BAD_REQUEST)
    }

    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) {
      return apiError('User not found', HTTP_STATUS.NOT_FOUND)
    }

    await prisma.folderMember.upsert({
      where: { folderId_userId: { folderId: resolvedPath, userId } },
      update: {},
      create: { folderId: resolvedPath, userId },
    })

    // Auto-mark the folder as TEAM whenever it has members
    if (folder.visibility !== 'TEAM') {
      await prisma.folder.update({
        where: { id: resolvedPath },
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
    const auth = await requireAuth(request)
    if (auth.response) return auth.response

    const { id } = await params
    const folderPath = normalizePath('/' + id.map(decodeURIComponent).join('/'))

    const folder = await prisma.folder.findFirst({ where: { id: { equals: folderPath, mode: 'insensitive' } } })
    if (!folder) {
      return apiError('Folder not found', HTTP_STATUS.NOT_FOUND)
    }

    const resolvedPath = folder.id

    const isOwner = auth.user.id === folder.userId
    const isSystemOwner = auth.user.role === 'OWNER'

    if (!isOwner && !isSystemOwner) {
      return apiError('Unauthorized', HTTP_STATUS.UNAUTHORIZED)
    }

    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')

    if (!userId) {
      return apiError('userId query param is required', HTTP_STATUS.BAD_REQUEST)
    }

    await prisma.folderMember.deleteMany({
      where: { folderId: resolvedPath, userId },
    })

    // If no members left, revert visibility back to PUBLIC
    const remaining = await prisma.folderMember.count({
      where: { folderId: resolvedPath },
    })
    if (remaining === 0) {
      await prisma.folder.update({
        where: { id: resolvedPath },
        data: { visibility: 'PUBLIC' },
      })
    }

    return apiResponse({ success: true })
  } catch (error) {
    logger.error('Error removing folder member', error as Error)
    return apiError('Failed to remove member', HTTP_STATUS.INTERNAL_SERVER_ERROR)
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string[] }> }
) {
  try {
    const auth = await requireAuth(request)
    if (auth.response) return auth.response

    const { id } = await params
    const folderPath = normalizePath('/' + id.map(decodeURIComponent).join('/'))

    const folder = await prisma.folder.findFirst({ where: { id: { equals: folderPath, mode: 'insensitive' } } })
    if (!folder) {
      return apiError('Folder not found', HTTP_STATUS.NOT_FOUND)
    }

    const resolvedPath = folder.id

    const isOwner = auth.user.id === folder.userId
    const isSystemOwner = auth.user.role === 'OWNER'
    const isSystemAdmin = auth.user.role === 'ADMIN'

    if (!isOwner && !isSystemOwner && !isSystemAdmin) {
      return apiError('Unauthorized', HTTP_STATUS.UNAUTHORIZED)
    }

    const body = await request.json()
    const { teamLeaderId } = body

    if (teamLeaderId) {
      const leaderExists = await prisma.user.findUnique({ where: { id: teamLeaderId } })
      if (!leaderExists) {
        return apiError('Selected user not found', HTTP_STATUS.NOT_FOUND)
      }
    }

    await prisma.folder.update({
      where: { id: resolvedPath },
      data: { teamLeaderId: teamLeaderId || null },
    })

    return apiResponse({ success: true })
  } catch (error) {
    logger.error('Error updating team leader', error as Error)
    return apiError('Failed to update team leader', HTTP_STATUS.INTERNAL_SERVER_ERROR)
  }
}
