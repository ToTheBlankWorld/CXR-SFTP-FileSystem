import { NextResponse } from 'next/server'

import { getServerSession } from 'next-auth'

import { authOptions } from '@/lib/auth'

export const maxDuration = 60

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (session?.user?.role !== 'ADMIN' && session?.user?.role !== 'OWNER') {
      return new NextResponse('Unauthorized', { status: 401 })
    }

    const formData = await req.formData()
    const file = formData.get('file') as File
    if (!file) {
      return new NextResponse('No file provided', { status: 400 })
    }

    return new NextResponse('Favicon updated', { status: 200 })
  } catch {
    return new NextResponse('Internal server error', { status: 500 })
  }
}
