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
      include: { members: { select: { userId: true } } },
    })

    if (!folder) {
      return apiError('Folder not found', HTTP_STATUS.NOT_FOUND)
    }

    const resolvedPath = folder.id

    const isSystemOwner = auth.user.role === 'OWNER'
    const isSystemAdmin = auth.user.role === 'ADMIN'
    const isFolderOwner = auth.user.id === folder.userId
    const isMember = folder.members.some((m) => m.userId === auth.user.id)

    if (!isSystemOwner && !isSystemAdmin && !isFolderOwner && !isMember) {
      return apiError('Access denied', HTTP_STATUS.FORBIDDEN)
    }

    // Fetch the latest 100 messages
    const messages = await prisma.chatMessage.findMany({
      where: { folderId: resolvedPath },
      orderBy: { createdAt: 'asc' },
      include: {
        user: {
          select: { id: true, name: true, email: true, role: true, image: true },
        },
      },
      take: 100,
    })

    // Fetch active typing users in the last 6 seconds, excluding current user
    const activeTypings = await prisma.chatTyping.findMany({
      where: {
        folderId: resolvedPath,
        userId: { not: auth.user.id },
        updatedAt: { gte: new Date(Date.now() - 6000) },
      },
      include: {
        user: {
          select: { name: true, email: true },
        },
      },
    })

    const typingUsers = activeTypings.map((t) => t.user.name || t.user.email || 'Someone')

    return apiResponse({ messages, typingUsers })
  } catch (error) {
    logger.error('Failed to fetch chat messages', error as Error)
    return apiError('Failed to fetch chat messages', HTTP_STATUS.INTERNAL_SERVER_ERROR)
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

    const folder = await prisma.folder.findFirst({
      where: { id: { equals: folderPath, mode: 'insensitive' } },
      include: { members: { select: { userId: true } } },
    })

    if (!folder) {
      return apiError('Folder not found', HTTP_STATUS.NOT_FOUND)
    }

    const resolvedPath = folder.id

    const isSystemOwner = auth.user.role === 'OWNER'
    const isSystemAdmin = auth.user.role === 'ADMIN'
    const isFolderOwner = auth.user.id === folder.userId
    const isMember = folder.members.some((m) => m.userId === auth.user.id)

    if (!isSystemOwner && !isSystemAdmin && !isFolderOwner && !isMember) {
      return apiError('Access denied', HTTP_STATUS.FORBIDDEN)
    }

    const body = await request.json()
    const { message } = body

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return apiError('Message cannot be empty', HTTP_STATUS.BAD_REQUEST)
    }

    const created = await prisma.chatMessage.create({
      data: {
        folderId: resolvedPath,
        userId: auth.user.id,
        message: message.trim(),
      },
      include: {
        user: {
          select: { id: true, name: true, email: true, role: true, image: true },
        },
      },
    })

    return apiResponse(created)
  } catch (error) {
    logger.error('Failed to send message', error as Error)
    return apiError('Failed to send message', HTTP_STATUS.INTERNAL_SERVER_ERROR)
  }
}

export async function PUT(
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
      include: { members: { select: { userId: true } } },
    })

    if (!folder) {
      return apiError('Folder not found', HTTP_STATUS.NOT_FOUND)
    }

    const resolvedPath = folder.id

    const isSystemOwner = auth.user.role === 'OWNER'
    const isSystemAdmin = auth.user.role === 'ADMIN'
    const isFolderOwner = auth.user.id === folder.userId
    const isMember = folder.members.some((m) => m.userId === auth.user.id)

    if (!isSystemOwner && !isSystemAdmin && !isFolderOwner && !isMember) {
      return apiError('Access denied', HTTP_STATUS.FORBIDDEN)
    }

    await prisma.chatTyping.upsert({
      where: {
        folderId_userId: { folderId: resolvedPath, userId: auth.user.id },
      },
      update: { updatedAt: new Date() },
      create: { folderId: resolvedPath, userId: auth.user.id },
    })

    return apiResponse({ success: true })
  } catch (error) {
    logger.error('Failed to update typing status', error as Error)
    return apiError('Failed to update typing status', HTTP_STATUS.INTERNAL_SERVER_ERROR)
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

    const folder = await prisma.folder.findFirst({
      where: { id: { equals: folderPath, mode: 'insensitive' } },
    })

    if (!folder) {
      return apiError('Folder not found', HTTP_STATUS.NOT_FOUND)
    }

    const resolvedPath = folder.id

    const isSystemOwner = auth.user.role === 'OWNER'
    const isSystemAdmin = auth.user.role === 'ADMIN'
    const isFolderOwner = auth.user.id === folder.userId

    if (!isSystemOwner && !isSystemAdmin && !isFolderOwner) {
      return apiError('Unauthorized', HTTP_STATUS.UNAUTHORIZED)
    }

    await prisma.chatMessage.deleteMany({
      where: { folderId: resolvedPath },
    })

    return apiResponse({ success: true })
  } catch (error) {
    logger.error('Failed to clear chat messages', error as Error)
    return apiError('Failed to clear chat', HTTP_STATUS.INTERNAL_SERVER_ERROR)
  }
}
