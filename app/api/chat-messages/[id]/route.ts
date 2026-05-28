import { HTTP_STATUS, apiError, apiResponse } from '@/lib/api/response'
import { requireAuth } from '@/lib/auth/api-auth'
import { prisma } from '@/lib/database/prisma'
import { loggers } from '@/lib/logger'

const logger = loggers.files

const MAX_MESSAGE_LENGTH = 1000

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(request)
    if (auth.response) return auth.response

    const { id } = await params

    const existing = await prisma.chatMessage.findUnique({ where: { id } })
    if (!existing) {
      return apiError('Message not found', HTTP_STATUS.NOT_FOUND)
    }

    // Only the original author can edit their own message
    if (existing.userId !== auth.user.id) {
      return apiError('You can only edit your own messages', HTTP_STATUS.FORBIDDEN)
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

    const updated = await prisma.chatMessage.update({
      where: { id },
      data: { message: trimmed, editedAt: new Date() },
      include: {
        user: {
          select: { id: true, name: true, email: true, role: true, image: true },
        },
      },
    })

    return apiResponse(updated)
  } catch (error) {
    logger.error('Failed to edit chat message', error as Error)
    return apiError('Failed to edit message', HTTP_STATUS.INTERNAL_SERVER_ERROR)
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(request)
    if (auth.response) return auth.response

    const { id } = await params

    const existing = await prisma.chatMessage.findUnique({
      where: { id },
      include: { folder: { select: { userId: true } } },
    })
    if (!existing) {
      return apiError('Message not found', HTTP_STATUS.NOT_FOUND)
    }

    const isAuthor = existing.userId === auth.user.id
    const isFolderOwner = existing.folder?.userId === auth.user.id
    const isSystemOwner = auth.user.role === 'OWNER'
    const isSystemAdmin = auth.user.role === 'ADMIN'

    // Author can delete their own message; folder owner and system staff can moderate
    if (!isAuthor && !isFolderOwner && !isSystemOwner && !isSystemAdmin) {
      return apiError('You are not allowed to delete this message', HTTP_STATUS.FORBIDDEN)
    }

    await prisma.chatMessage.delete({ where: { id } })

    return apiResponse({ success: true })
  } catch (error) {
    logger.error('Failed to delete chat message', error as Error)
    return apiError('Failed to delete message', HTTP_STATUS.INTERNAL_SERVER_ERROR)
  }
}
