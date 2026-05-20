import { NextResponse } from 'next/server'

import { getServerSession } from 'next-auth'

import { authOptions } from '@/lib/auth'
import { loggers } from '@/lib/logger'

const logger = loggers.api

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    const { id: _id } = await params

    if (!session?.user || session.user.role !== 'ADMIN') {
      return new NextResponse('Unauthorized', { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
    const limit = Math.max(1, Math.min(100, parseInt(searchParams.get('limit') || '10')))

    return NextResponse.json({
      files: [],
      pagination: {
        total: 0,
        pageCount: 0,
        page,
        limit,
      },
    })
  } catch (error) {
    logger.error('Error listing user files', error as Error)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}
