import { HTTP_STATUS, apiError, apiResponse } from '@/lib/api/response'
import { requireAuth } from '@/lib/auth/api-auth'
import { prisma } from '@/lib/database/prisma'
import { loggers } from '@/lib/logger'
import { normalizePath } from '@/lib/utils'

const logger = loggers.files

export async function GET(request: Request) {
  try {
    const auth = await requireAuth(request)
    if (auth.response) return auth.response

    const { searchParams } = new URL(request.url)
    const pathParam = searchParams.get('path')

    if (!pathParam) {
      return apiError('Path query parameter is required', HTTP_STATUS.BAD_REQUEST)
    }

    const folderPath = normalizePath(pathParam)
    if (folderPath === '' || folderPath === '/') {
      return apiResponse({ isAllowed: false })
    }

    const parts = folderPath.split('/').filter(Boolean)
    const prefixPaths: string[] = []
    let current = ''
    for (const part of parts) {
      current = `${current}/${part}`
      prefixPaths.push(current)
    }

    // Find all prefix folders in the database, ordered from root down to the leaf
    const folders = await prisma.folder.findMany({
      where: { id: { in: prefixPaths } },
      orderBy: { id: 'asc' },
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
        },
      },
    })

    // Find the first (highest-level) parent folder that is a TEAM folder
    const teamFolder = folders.find((f) => f.visibility === 'TEAM')

    if (!teamFolder) {
      return apiResponse({ isAllowed: false })
    }

    const isSystemOwner = auth.user.role === 'OWNER'
    const isSystemAdmin = auth.user.role === 'ADMIN'
    const isFolderOwner = auth.user.id === teamFolder.userId
    const isMember = teamFolder.members.some((m) => m.userId === auth.user.id)

    // Only members of the team, the folder creator, or system owners/admins are allowed
    if (isSystemOwner || isSystemAdmin || isFolderOwner || isMember) {
      // Build the mentionable roster: folder creator + members, de-duplicated
      const roster = new Map<string, { id: string; name: string | null; email: string | null; role: string; image: string | null }>()
      if (teamFolder.user) roster.set(teamFolder.user.id, teamFolder.user)
      for (const m of teamFolder.members) {
        if (m.user) roster.set(m.user.id, m.user)
      }

      return apiResponse({
        isAllowed: true,
        chatFolderId: teamFolder.id,
        chatFolderName: teamFolder.name,
        ownerId: teamFolder.userId,
        members: Array.from(roster.values()),
      })
    }

    return apiResponse({ isAllowed: false })
  } catch (error) {
    logger.error('Failed to verify chat authorization', error as Error)
    return apiError('Failed to verify chat authorization', HTTP_STATUS.INTERNAL_SERVER_ERROR)
  }
}
