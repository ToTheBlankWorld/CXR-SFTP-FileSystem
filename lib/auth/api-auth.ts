import { NextResponse } from 'next/server'

import { getServerSession } from 'next-auth'

import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/database/prisma'

export type AuthenticatedUser = {
  id: string
  urlId: string
  vanityId: string | null
  role: string
}

export async function getAuthenticatedUser(
  req: Request
): Promise<AuthenticatedUser | null> {
  const session = await getServerSession(authOptions)
  if (session?.user) {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        urlId: true,
        vanityId: true,
        role: true,
      },
    })
    return user
  }

  const authHeader = req.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7)
    const user = await prisma.user.findUnique({
      where: { uploadToken: token },
      select: {
        id: true,
        urlId: true,
        vanityId: true,
        role: true,
      },
    })
    return user
  }

  return null
}

export async function requireAuth(req: Request) {
  const user = await getAuthenticatedUser(req)
  if (!user) {
    return {
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
      user: null,
    }
  }
  return { user, response: null }
}

export async function requireAdmin() {
  const session = await getServerSession(authOptions)

  if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'OWNER')) {
    return {
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
      user: null,
    }
  }

  return { user: session.user, response: null }
}

export async function requireOwner() {
  const session = await getServerSession(authOptions)

  if (!session?.user || session.user.role !== 'OWNER') {
    return {
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
      user: null,
    }
  }

  return { user: session.user, response: null }
}
