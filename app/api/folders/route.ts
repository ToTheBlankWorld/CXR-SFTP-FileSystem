import { listDir, mkdir } from '@/lib/sftp'
import { HTTP_STATUS, apiError, apiResponse } from '@/lib/api/response'
import { requireAuth } from '@/lib/auth/api-auth'
import { prisma } from '@/lib/database/prisma'
import { loggers } from '@/lib/logger'
import { checkFolderAccess } from '@/lib/folders/access'
import { hash } from 'bcryptjs'
import { normalizePath } from '@/lib/utils'

const logger = loggers.files

export async function GET(request: Request) {
  try {
    const auth = await requireAuth(request)
    if (auth.response) return auth.response

    const { searchParams } = new URL(request.url)
    const parentPath = normalizePath(searchParams.get('parentId') || '/')

    // Decode folder passwords from request header
    const folderPasswordHeader = request.headers.get('x-folder-password')
    let providedPasswords: Record<string, string> | string | null = null
    if (folderPasswordHeader) {
      try {
        const decoded = decodeURIComponent(folderPasswordHeader)
        providedPasswords = JSON.parse(decoded)
      } catch {
        providedPasswords = decodeURIComponent(folderPasswordHeader)
      }
    }

    // Verify parent folder access
    const accessResult = await checkFolderAccess(parentPath, auth, providedPasswords)
    if (!accessResult.allowed) {
      if (accessResult.reason === 'password_required' || accessResult.reason === 'password_invalid') {
        return new Response(JSON.stringify({ error: accessResult.reason }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({ error: 'Folder not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const entries = await listDir(parentPath)
    
    // First map all raw directories from SFTP
    const folders = await Promise.all(
      entries
        .filter((e) => e.type === 'directory')
        .map(async (e) => {
          const normalizedFolderId = normalizePath(e.path)
          const prefix = normalizedFolderId.endsWith('/') ? normalizedFolderId : `${normalizedFolderId}/`
          const fileAgg = await prisma.file.aggregate({
            _sum: { size: true },
            where: {
              path: {
                startsWith: prefix,
              },
            },
          })
          const size = fileAgg._sum.size || 0

          return {
            id: normalizedFolderId,
            name: e.name,
            userId: '',
            parentId: parentPath === '/' ? null : parentPath,
            createdAt: e.modifyTime.toISOString(),
            updatedAt: e.modifyTime.toISOString(),
            fileCount: 0,
            size,
          }
        })
    )

    // Merge SFTP directories with database properties
    const folderIds = folders.map((f) => f.id)
    const dbFolders = await prisma.folder.findMany({
      where: { id: { in: folderIds } },
      include: { members: { select: { userId: true } } },
    })
    const dbFolderMap = new Map(dbFolders.map((f) => [normalizePath(f.id), f]))

    const filteredFolders = []
    const now = new Date()
    const isOwnerRole = auth.user?.role === 'OWNER'

    for (const folder of folders) {
      const dbFolder = dbFolderMap.get(folder.id)
      if (dbFolder) {
        // Expiration check
        if (dbFolder.expiresAt && new Date(dbFolder.expiresAt) < now) {
          continue
        }

        // Visibility checks
        const isOwner = auth.user?.id === dbFolder.userId

        if (dbFolder.visibility === 'PRIVATE' && !isOwner) {
          continue
        }
        if (dbFolder.visibility === 'USERS_AND_ADMINS' && !auth.user) {
          continue
        }
        if (dbFolder.visibility === 'USER_ONLY' && (!auth.user || ((auth.user.role === 'ADMIN' || auth.user.role === 'OWNER') && !isOwner))) {
          continue
        }

        // TEAM folders are visible to everyone but client decides access on click
        const isMember =
          dbFolder.visibility === 'TEAM'
            ? isOwnerRole ||
              isOwner ||
              (!!auth.user && dbFolder.members.some((m) => m.userId === auth.user.id))
            : true

        filteredFolders.push({
          ...folder,
          userId: dbFolder.userId,
          visibility: dbFolder.visibility,
          hasPassword: !!dbFolder.password,
          expiresAt: dbFolder.expiresAt ? dbFolder.expiresAt.toISOString() : null,
          isMember,
          teamLeaderId: dbFolder.teamLeaderId,
        })
      } else {
        // Legacy folders have PUBLIC access and no protection settings
        filteredFolders.push({
          ...folder,
          userId: '',
          visibility: 'PUBLIC',
          hasPassword: false,
          expiresAt: null,
          isMember: true,
          teamLeaderId: null,
        })
      }
    }

    return apiResponse(filteredFolders)
  } catch (error) {
    logger.error('Error listing folders', error as Error)
    return apiError('Failed to list folders', HTTP_STATUS.INTERNAL_SERVER_ERROR)
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuth(request)
    if (auth.response) return auth.response

    const body = await request.json()
    const { name, parentId, password, visibility, expiresAt } = body

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return apiError('Folder name is required', HTTP_STATUS.BAD_REQUEST)
    }

    const cleanName = name.trim()
    const parentPath = normalizePath(parentId || '/')
    const newPath = normalizePath(`${parentPath}/${cleanName}`)

    // Verify parent folder permission
    const folderPasswordHeader = request.headers.get('x-folder-password')
    let providedPasswords: Record<string, string> | string | null = null
    if (folderPasswordHeader) {
      try {
        const decoded = decodeURIComponent(folderPasswordHeader)
        providedPasswords = JSON.parse(decoded)
      } catch {
        providedPasswords = decodeURIComponent(folderPasswordHeader)
      }
    }

    const accessResult = await checkFolderAccess(parentPath, auth, providedPasswords)
    if (!accessResult.allowed) {
      return apiError("You don't have permission to create folders inside this directory", HTTP_STATUS.FORBIDDEN)
    }

    await mkdir(newPath)

    let hashedPassword = null
    if (password) {
      hashedPassword = await hash(password, 10)
    }

    const cleanParentId = parentPath === '/' ? null : parentPath
    const folderData = {
      name: cleanName,
      userId: auth.user!.id,
      parentId: cleanParentId,
      password: hashedPassword,
      visibility: visibility || 'PUBLIC',
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    }

    await prisma.folder.upsert({
      where: { id: newPath },
      update: folderData,
      create: { id: newPath, ...folderData },
    })

    return apiResponse({
      id: newPath,
      name: cleanName,
      userId: auth.user?.id || '',
      parentId: parentPath === '/' ? null : parentPath,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      fileCount: 0,
      visibility: visibility || 'PUBLIC',
      hasPassword: !!password,
      expiresAt: expiresAt || null,
    })
  } catch (error) {
    logger.error('Error creating folder', error as Error)
    return apiError('Failed to create folder', HTTP_STATUS.INTERNAL_SERVER_ERROR)
  }
}
