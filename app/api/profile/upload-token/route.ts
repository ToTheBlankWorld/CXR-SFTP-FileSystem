import { NextResponse } from 'next/server'

import { HTTP_STATUS, apiError } from '@/lib/api/response'
import { requireAuth } from '@/lib/auth/api-auth'
import { prisma } from '@/lib/database/prisma'
import { loggers } from '@/lib/logger'

const logger = loggers.api

export async function GET(req: Request) {
  try {
    const { user, response } = await requireAuth(req)
    if (response) return response

    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { uploadToken: true },
    })

    if (!dbUser) {
      return apiError('User not found', HTTP_STATUS.NOT_FOUND)
    }

    return NextResponse.json({ uploadToken: dbUser.uploadToken })
  } catch (error) {
    logger.error('Error fetching upload token', error as Error)
    return apiError('Internal server error', HTTP_STATUS.INTERNAL_SERVER_ERROR)
  }
}

export async function POST(req: Request) {
  try {
    const { user, response } = await requireAuth(req)
    if (response) return response

    const newToken = crypto.randomUUID()

    await prisma.user.update({
      where: { id: user.id },
      data: { uploadToken: newToken },
    })

    return NextResponse.json({ uploadToken: newToken })
  } catch (error) {
    logger.error('Error refreshing upload token', error as Error)
    return apiError('Internal server error', HTTP_STATUS.INTERNAL_SERVER_ERROR)
  }
}
