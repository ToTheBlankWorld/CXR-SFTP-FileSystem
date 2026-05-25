import { NextResponse } from 'next/server'

import { getServerSession } from 'next-auth'

import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/database/prisma'
import { loggers } from '@/lib/logger'

const logger = loggers.api

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    const { id } = await params

    if (!session?.user || session.user.role !== 'OWNER') {
      return new NextResponse('Unauthorized', { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
    const limit = Math.max(1, Math.min(100, parseInt(searchParams.get('limit') || '10')))
    const search = searchParams.get('search') || ''

    const where: Record<string, unknown> = { userId: id }
    if (search) {
      where.targetUrl = { contains: search, mode: 'insensitive' }
    }

    const [urls, total] = await Promise.all([
      prisma.shortenedUrl.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.shortenedUrl.count({ where }),
    ])

    return NextResponse.json({
      urls,
      pagination: {
        total,
        pageCount: Math.ceil(total / limit),
        page,
        limit,
      },
    })
  } catch (error) {
    logger.error('Error listing user URLs', error as Error)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}
