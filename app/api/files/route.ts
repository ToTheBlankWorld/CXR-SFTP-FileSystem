import { listDir, uploadFile, deleteFile, rename } from '@/lib/sftp'
import { getMimeType } from '@/lib/sftp/mime'
import { HTTP_STATUS, apiError, apiResponse, paginatedResponse } from '@/lib/api/response'
import { requireAuth } from '@/lib/auth/api-auth'
import { prisma } from '@/lib/database/prisma'
import { loggers } from '@/lib/logger'
import { checkFolderAccess } from '@/lib/folders/access'
import { hash } from 'bcryptjs'
import { FileVisibility } from '@prisma/client'

const logger = loggers.files

async function ensureParentFoldersExist(
  filePath: string,
  userId: string,
  options: { passwordHash: string | null; visibility: FileVisibility; expiresAt: Date | null }
) {
  const segments = filePath.split('/').filter(Boolean)
  if (segments.length <= 1) return

  const folderSegments = segments.slice(0, -1)
  let currentPath = ''
  for (let i = 0; i < folderSegments.length; i++) {
    const name = folderSegments[i]
    const parentPath = currentPath === '' ? '/' : currentPath
    currentPath = `${currentPath}/${name}`

    const cleanParentId = parentPath === '/' ? null : parentPath

    await prisma.folder.upsert({
      where: { id: currentPath },
      update: {
        visibility: options.visibility,
        password: options.passwordHash,
        expiresAt: options.expiresAt,
      },
      create: {
        id: currentPath,
        name: name,
        userId: userId,
        parentId: cleanParentId,
        visibility: options.visibility,
        password: options.passwordHash,
        expiresAt: options.expiresAt,
      },
    })
  }
}

export async function GET(request: Request) {
  try {
    const auth = await requireAuth(request)
    if (auth.response) return auth.response

    const { searchParams } = new URL(request.url)
    const dirPath = searchParams.get('path') || '/'
    const search = searchParams.get('search') || ''
    const sortBy = searchParams.get('sortBy') || 'newest'
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '24')

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
    const accessResult = await checkFolderAccess(dirPath, auth, providedPasswords)
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

    let entries = await listDir(dirPath)

    logger.info('listDir ' + dirPath + ' entries=' + entries.length + ' names=[' + entries.map(e => e.name).join(',') + ']')

    if (search) {
      const q = search.toLowerCase()
      entries = entries.filter((e) => e.name.toLowerCase().includes(q))
    }

    const rawFiles = entries
      .filter((e) => e.type === 'file')
      .map((e) => ({
        id: e.path,
        name: e.name,
        urlPath: `/api/files/serve?path=${encodeURIComponent(e.path)}`,
        mimeType: getMimeType(e.name),
        size: e.size,
        uploadedAt: e.modifyTime.toISOString(),
      }))

    // Fetch database records for files to merge properties
    const filePaths = rawFiles.map((f) => f.id)
    const dbFiles = await prisma.file.findMany({
      where: { path: { in: filePaths } },
      include: { user: { select: { role: true } } },
    })
    const dbFileMap = new Map(dbFiles.map((f) => [f.path, f]))

    const filteredFiles = []
    const now = new Date()

    for (const file of rawFiles) {
      const dbFile = dbFileMap.get(file.id)
      if (dbFile) {
        // Expiration check
        if (dbFile.expiresAt && new Date(dbFile.expiresAt) < now) {
          continue
        }

        // Visibility checks
        const isOwner = auth.user?.id === dbFile.userId
        const isAdmin = auth.user?.role === 'ADMIN'

        if (dbFile.user?.role === 'ADMIN' && !isAdmin && !isOwner) {
          continue
        }
        if (dbFile.visibility === 'PRIVATE' && !isOwner && !isAdmin) {
          continue
        }
        if (dbFile.visibility === 'USERS_AND_ADMINS' && !auth.user) {
          continue
        }
        if (dbFile.visibility === 'USER_ONLY' && !auth.user) {
          continue
        }

        filteredFiles.push({
          ...file,
          userId: dbFile.userId,
          visibility: dbFile.visibility,
          hasPassword: !!dbFile.password,
          expiresAt: dbFile.expiresAt ? dbFile.expiresAt.toISOString() : null,
          views: dbFile.views,
          downloads: dbFile.downloads,
        })
      } else {
        // Legacy files default to PUBLIC and no settings
        filteredFiles.push({
          ...file,
          userId: '',
          visibility: 'PUBLIC' as const,
          hasPassword: false,
          expiresAt: null,
          views: 0,
          downloads: 0,
        })
      }
    }

    switch (sortBy) {
      case 'oldest':
        filteredFiles.sort((a, b) => a.uploadedAt.localeCompare(b.uploadedAt)); break
      case 'largest':
        filteredFiles.sort((a, b) => b.size - a.size); break
      case 'smallest':
        filteredFiles.sort((a, b) => a.size - b.size); break
      case 'name':
        filteredFiles.sort((a, b) => a.name.localeCompare(b.name)); break
      default:
        filteredFiles.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))
    }

    const total = filteredFiles.length
    const start = (page - 1) * limit
    const pagedFiles = filteredFiles.slice(start, start + limit)

    return paginatedResponse(pagedFiles, {
      total, pageCount: Math.ceil(total / limit), page, limit,
    })
  } catch (error) {
    logger.error('Error listing files', error as Error)
    return apiError('Failed to list files', HTTP_STATUS.INTERNAL_SERVER_ERROR)
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireAuth(req)
    if (auth.response) return auth.response

    const formData = await req.formData()
    const uploadedFile = formData.get('file') as File
    const targetPath = (formData.get('path') as string) || '/'
    const subpath = (formData.get('subpath') as string) || ''
    const fullpath = (formData.get('fullpath') as string) || ''

    // Access settings parameters
    const password = formData.get('password') as string | null
    const visibility = ((formData.get('visibility') as string) || 'PUBLIC') as FileVisibility
    const expiresAt = formData.get('expiresAt') as string | null

    if (!uploadedFile) {
      return apiError('No file provided', HTTP_STATUS.BAD_REQUEST)
    }

    if (auth.user?.role !== 'ADMIN') {
      const config = await (await import('@/lib/config')).getConfig()
      const maxSize = config.settings.general.maxUploadSize
      if (uploadedFile.size > maxSize) {
        return apiError(`File exceeds the maximum upload size of ${Math.round(maxSize / 1024 / 1024)}MB`, HTTP_STATUS.PAYLOAD_TOO_LARGE)
      }
    }

    // Verify parent folder access
    const folderPasswordHeader = req.headers.get('x-folder-password')
    let providedPasswords: Record<string, string> | string | null = null
    if (folderPasswordHeader) {
      try {
        const decoded = decodeURIComponent(folderPasswordHeader)
        providedPasswords = JSON.parse(decoded)
      } catch {
        providedPasswords = decodeURIComponent(folderPasswordHeader)
      }
    }

    const accessResult = await checkFolderAccess(targetPath, auth, providedPasswords)
    if (!accessResult.allowed) {
      return apiError("You don't have permission to upload files inside this directory", HTTP_STATUS.FORBIDDEN)
    }

    const bytes = await uploadedFile.arrayBuffer()
    const buffer = Buffer.from(bytes)
    const fileName = fullpath || (subpath ? `${subpath}/${uploadedFile.name}` : uploadedFile.name)
    const remotePath = `${targetPath}/${fileName}`.replace(/\/+/g, '/')

    logger.info('upload targetPath=' + targetPath + ' subpath=' + subpath + ' fullpath=' + fullpath + ' fileName=' + uploadedFile.name + ' remotePath=' + remotePath)

    await uploadFile(buffer, remotePath)

    let hashedPassword = null
    if (password) {
      hashedPassword = await hash(password, 10)
    }

    const parsedExpiresAt = expiresAt ? new Date(expiresAt) : null

    // Ensure all parent directories are registered
    await ensureParentFoldersExist(remotePath, auth.user!.id, {
      passwordHash: hashedPassword,
      visibility,
      expiresAt: parsedExpiresAt,
    })

    const urlPath = `/api/files/serve?path=${encodeURIComponent(remotePath)}`
    await prisma.file.upsert({
      where: { path: remotePath },
      update: {
        size: uploadedFile.size,
        name: uploadedFile.name,
        visibility,
        password: hashedPassword,
        expiresAt: parsedExpiresAt,
      },
      create: {
        path: remotePath,
        name: uploadedFile.name,
        urlPath,
        mimeType: uploadedFile.type || 'application/octet-stream',
        size: uploadedFile.size,
        visibility,
        password: hashedPassword,
        expiresAt: parsedExpiresAt,
        userId: auth.user!.id,
        isOcrProcessed: false,
        isPaste: false,
        views: 0,
        downloads: 0,
      },
    })

    return apiResponse({
      url: `/api/files/serve?path=${encodeURIComponent(remotePath)}`,
      name: uploadedFile.name,
      size: uploadedFile.size,
      type: uploadedFile.type,
      visibility,
      hasPassword: !!password,
      expiresAt: expiresAt || null,
    })
  } catch (error) {
    logger.error('Upload error', error as Error)
    return apiError('Upload failed', HTTP_STATUS.INTERNAL_SERVER_ERROR)
  }
}

export async function DELETE(req: Request) {
  try {
    const auth = await requireAuth(req)
    if (auth.response) return auth.response

    const { searchParams } = new URL(req.url)
    const filePath = searchParams.get('path')

    if (!filePath) {
      return apiError('File path is required', HTTP_STATUS.BAD_REQUEST)
    }

    if (auth.user?.role !== 'ADMIN') {
      const file = await prisma.file.findUnique({ where: { path: filePath } })
      if (!file || file.userId !== auth.user.id) {
        return apiError("You don't have permission to modify or delete this file", HTTP_STATUS.FORBIDDEN)
      }
    }

    await deleteFile(filePath)
    await prisma.file.deleteMany({ where: { path: filePath } })
    return apiResponse({ success: true })
  } catch (error) {
    logger.error('File delete error', error as Error)
    const errMessage = (error as Error).message || ''
    if (
      errMessage.toLowerCase().includes('permission') ||
      errMessage.toLowerCase().includes('denied') ||
      errMessage.toLowerCase().includes('unauthorized')
    ) {
      return apiError("You don't have permission to modify or delete this file", HTTP_STATUS.FORBIDDEN)
    }
    return apiError('Failed to delete file', HTTP_STATUS.INTERNAL_SERVER_ERROR)
  }
}

export async function PATCH(req: Request) {
  try {
    const auth = await requireAuth(req)
    if (auth.response) return auth.response

    const body = await req.json()
    const { path: filePath, name } = body

    if (!filePath || !name) {
      return apiError('File path and new name are required', HTTP_STATUS.BAD_REQUEST)
    }

    if (auth.user?.role !== 'ADMIN') {
      const file = await prisma.file.findUnique({ where: { path: filePath } })
      if (!file || file.userId !== auth.user.id) {
        return apiError("You don't have permission to modify or delete this file", HTTP_STATUS.FORBIDDEN)
      }
    }

    const parentDir = filePath.substring(0, filePath.lastIndexOf('/') + 1)
    const newPath = `${parentDir}${name}`

    await rename(filePath, newPath)

    // Update path, name and urlPath in DB
    await prisma.file.updateMany({
      where: { path: filePath },
      data: {
        path: newPath,
        name: name,
        urlPath: `/api/files/serve?path=${encodeURIComponent(newPath)}`
      }
    })

    return apiResponse({ success: true, newPath })
  } catch (error) {
    logger.error('File rename error', error as Error)
    const errMessage = (error as Error).message || ''
    if (
      errMessage.toLowerCase().includes('permission') ||
      errMessage.toLowerCase().includes('denied') ||
      errMessage.toLowerCase().includes('unauthorized')
    ) {
      return apiError("You don't have permission to modify or delete this file", HTTP_STATUS.FORBIDDEN)
    }
    return apiError('Failed to rename file', HTTP_STATUS.INTERNAL_SERVER_ERROR)
  }
}
