import { HTTP_STATUS, apiError, apiResponse } from '@/lib/api/response'
import { requireAuth } from '@/lib/auth/api-auth'
import { prisma } from '@/lib/database/prisma'
import { loggers } from '@/lib/logger'
import { normalizePath } from '@/lib/utils'

const logger = loggers.files

const MAX_MESSAGE_LENGTH = 1000

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string[] }> }
) {
  try {
    const auth = await requireAuth(request)
    if (auth.response) return auth.response

    const { id } = await params
    const folderPath = normalizePath('/' + id.map(decodeURIComponent).join('/'))

    const folder = await prisma.folder.findUnique({
      where: { id: folderPath },
      include: { members: { select: { userId: true } } },
    })

    if (!folder) {
      return apiError('Folder not found', HTTP_STATUS.NOT_FOUND)
    }

    const isSystemOwner = auth.user.role === 'OWNER'
    const isSystemAdmin = auth.user.role === 'ADMIN'
    const isFolderOwner = auth.user.id === folder.userId
    const isMember = folder.members.some((m) => m.userId === auth.user.id)

    if (!isSystemOwner && !isSystemAdmin && !isFolderOwner && !isMember) {
      return apiError('Access denied', HTTP_STATUS.FORBIDDEN)
    }

    const { searchParams } = new URL(request.url)

    // Lightweight unread-poll mode: just the latest message id + total count
    if (searchParams.get('meta') === '1') {
      const [latest, count] = await Promise.all([
        prisma.chatMessage.findFirst({
          where: { folderId: folderPath },
          orderBy: { createdAt: 'desc' },
          select: { id: true },
        }),
        prisma.chatMessage.count({ where: { folderId: folderPath } }),
      ])
      return apiResponse({ latestMessageId: latest?.id ?? null, messageCount: count })
    }

    const since = searchParams.get('since')

    const messageSelect = {
      include: {
        user: {
          select: { id: true, name: true, email: true, role: true, image: true },
        },
      },
    }

    let messages
    if (since) {
      // Incremental fetch: only messages newer than the client's latest
      messages = await prisma.chatMessage.findMany({
        where: { folderId: folderPath, createdAt: { gt: new Date(since) } },
        orderBy: { createdAt: 'asc' },
        ...messageSelect,
      })
    } else {
      // Initial load: the latest 100 messages, returned oldest-first
      const recent = await prisma.chatMessage.findMany({
        where: { folderId: folderPath },
        orderBy: { createdAt: 'desc' },
        take: 100,
        ...messageSelect,
      })
      messages = recent.reverse()
    }

    // Opportunistically clear out stale typing rows (older than 15s)
    await prisma.chatTyping
      .deleteMany({
        where: { folderId: folderPath, updatedAt: { lt: new Date(Date.now() - 15000) } },
      })
      .catch(() => {})

    // Fetch active typing users in the last 6 seconds, excluding current user
    const activeTypings = await prisma.chatTyping.findMany({
      where: {
        folderId: folderPath,
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

    const folder = await prisma.folder.findUnique({
      where: { id: folderPath },
      include: { members: { select: { userId: true } } },
    })

    if (!folder) {
      return apiError('Folder not found', HTTP_STATUS.NOT_FOUND)
    }

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

    const trimmed = message.trim()
    if (trimmed.length > MAX_MESSAGE_LENGTH) {
      return apiError(
        `Message cannot exceed ${MAX_MESSAGE_LENGTH} characters`,
        HTTP_STATUS.BAD_REQUEST
      )
    }

    const created = await prisma.chatMessage.create({
      data: {
        folderId: folderPath,
        userId: auth.user.id,
        message: trimmed,
      },
      include: {
        user: {
          select: { id: true, name: true, email: true, role: true, image: true },
        },
      },
    })

    // The sender is no longer typing once the message is sent
    await prisma.chatTyping
      .deleteMany({ where: { folderId: folderPath, userId: auth.user.id } })
      .catch(() => {})

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

    const folder = await prisma.folder.findUnique({
      where: { id: folderPath },
      include: { members: { select: { userId: true } } },
    })

    if (!folder) {
      return apiError('Folder not found', HTTP_STATUS.NOT_FOUND)
    }

    const isSystemOwner = auth.user.role === 'OWNER'
    const isSystemAdmin = auth.user.role === 'ADMIN'
    const isFolderOwner = auth.user.id === folder.userId
    const isMember = folder.members.some((m) => m.userId === auth.user.id)

    if (!isSystemOwner && !isSystemAdmin && !isFolderOwner && !isMember) {
      return apiError('Access denied', HTTP_STATUS.FORBIDDEN)
    }

    await prisma.chatTyping.upsert({
      where: {
        folderId_userId: { folderId: folderPath, userId: auth.user.id },
      },
      update: { updatedAt: new Date() },
      create: { folderId: folderPath, userId: auth.user.id },
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

    const folder = await prisma.folder.findUnique({
      where: { id: folderPath },
    })

    if (!folder) {
      return apiError('Folder not found', HTTP_STATUS.NOT_FOUND)
    }

    const isSystemOwner = auth.user.role === 'OWNER'
    const isSystemAdmin = auth.user.role === 'ADMIN'
    const isFolderOwner = auth.user.id === folder.userId

    if (!isSystemOwner && !isSystemAdmin && !isFolderOwner) {
      return apiError('Unauthorized', HTTP_STATUS.UNAUTHORIZED)
    }

    await prisma.chatMessage.deleteMany({
      where: { folderId: folderPath },
    })

    return apiResponse({ success: true })
  } catch (error) {
    logger.error('Failed to clear chat messages', error as Error)
    return apiError('Failed to clear chat', HTTP_STATUS.INTERNAL_SERVER_ERROR)
  }
}
