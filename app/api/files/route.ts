import { listDir, uploadFile, deleteFile, rename } from '@/lib/sftp'
import { getMimeType } from '@/lib/sftp/mime'
import { Readable } from 'stream'
import { HTTP_STATUS, apiError, apiResponse, paginatedResponse } from '@/lib/api/response'
import { requireAuth } from '@/lib/auth/api-auth'
import { prisma } from '@/lib/database/prisma'
import { loggers } from '@/lib/logger'
import { checkFolderAccess } from '@/lib/folders/access'
import { hash } from 'bcryptjs'
import { FileVisibility } from '@prisma/client'
import { normalizePath } from '@/lib/utils'
import { createWriteStream, existsSync } from 'fs'
import { unlink } from 'fs/promises'
import { join } from 'path'
import os from 'os'
import { pipeline } from 'stream/promises'

const logger = loggers.files

async function ensureParentFoldersExist(
  filePath: string,
  userId: string,
  options: { passwordHash: string | null; visibility: FileVisibility; expiresAt: Date | null }
) {
  const normalizedFilePath = normalizePath(filePath)
  const segments = normalizedFilePath.split('/').filter(Boolean)
  if (segments.length <= 1) return

  const folderSegments = segments.slice(0, -1)
  let currentPath = ''
  for (let i = 0; i < folderSegments.length; i++) {
    const name = folderSegments[i]
    const parentPath = currentPath === '' ? '/' : currentPath
    currentPath = normalizePath(`${currentPath}/${name}`)

    const cleanParentId = parentPath === '/' ? null : normalizePath(parentPath)

    try {
      await prisma.folder.upsert({
        where: { id: currentPath },
        update: {},
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
    } catch (err: unknown) {
      const error = err as { code?: string; message?: string }
      if (error.code === 'P2002' || error.message?.includes('Unique constraint')) {
        logger.info('Concurrent parent folder insertion swallowed: ' + currentPath)
      } else {
        throw err
      }
    }
  }
}

async function generateUniqueUrlPath(userUrlId: string, filename: string): Promise<string> {
  const baseName = filename.replace(/\s+/g, '-')
  let attempt = 0
  while (true) {
    const candidate = attempt === 0
      ? `/${userUrlId}/${baseName}`
      : `/${userUrlId}/${baseName.replace(/(\.[^.]+)?$/, `-${attempt}$1`)}`
    const existing = await prisma.file.findUnique({
      where: { urlPath: candidate },
      select: { id: true }
    })
    if (!existing) {
      return candidate
    }
    attempt++
  }
}

export async function GET(request: Request) {
  try {
    const auth = await requireAuth(request)
    if (auth.response) return auth.response

    const { searchParams } = new URL(request.url)
    const dirPath = normalizePath(searchParams.get('path') || '/')
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
      return new Response(JSON.stringify({ error: accessResult.reason }), {
        status: accessResult.status,
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
      .map((e) => {
        const normalizedPath = normalizePath(e.path)
        return {
          id: normalizedPath,
          name: e.name,
          urlPath: `/api/files/serve?path=${encodeURIComponent(normalizedPath)}`,
          mimeType: getMimeType(e.name),
          size: e.size,
          uploadedAt: e.modifyTime.toISOString(),
        }
      })

    // Fetch database records for files to merge properties
    const filePaths = rawFiles.map((f) => f.id)
    const dbFiles = await prisma.file.findMany({
      where: { path: { in: filePaths } },
      include: { user: { select: { role: true } } },
    })
    const dbFileMap = new Map(dbFiles.map((f) => [normalizePath(f.path), f]))

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
        const isAdmin = auth.user?.role === 'ADMIN' || auth.user?.role === 'OWNER'

        if ((dbFile.user?.role === 'ADMIN' || dbFile.user?.role === 'OWNER') && !isAdmin && !isOwner) {
          continue
        }
        if (dbFile.visibility === 'PRIVATE' && !isOwner) {
          continue
        }
        if (dbFile.visibility === 'USERS_AND_ADMINS' && !auth.user) {
          continue
        }
        if (dbFile.visibility === 'USER_ONLY' && (!auth.user || (isAdmin && !isOwner))) {
          continue
        }
        if (dbFile.visibility === 'TEAM' && !isOwner && !isAdmin) {
          continue
        }

        filteredFiles.push({
          ...file,
          size: dbFile.size ?? file.size,
          urlPath: dbFile.urlPath,
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

    const uploadType = req.headers.get('x-upload-type')

    let fileStream: Readable | null = null
    let tempFilePath: string | null = null
    let fileName: string
    let fileSize: number
    let fileType: string
    let targetPath: string
    let subpath = ''
    let fullpath = ''

    let password: string | null = null
    let visibility: FileVisibility = 'PUBLIC'
    let expiresAt: string | null = null

    if (uploadType === 'raw') {
      fileName = decodeURIComponent(req.headers.get('x-file-name') || '')
      targetPath = normalizePath(decodeURIComponent(req.headers.get('x-target-path') || '/'))
      subpath = decodeURIComponent(req.headers.get('x-subpath') || '')
      fullpath = decodeURIComponent(req.headers.get('x-fullpath') || '')
      fileSize = parseInt(req.headers.get('content-length') || '0', 10)
      fileType = getMimeType(fileName) || 'application/octet-stream'

      password = req.headers.get('x-file-password') ? decodeURIComponent(req.headers.get('x-file-password')!) : null
      visibility = (req.headers.get('x-file-visibility') || 'PUBLIC') as FileVisibility
      expiresAt = req.headers.get('x-file-expires-at')

      if (!req.body) {
        return apiError('No file body provided', HTTP_STATUS.BAD_REQUEST)
      }

      // Stream incoming raw request body directly to a local temp file to avoid in-memory buffering bottleneck
      tempFilePath = join(os.tmpdir(), `upload-${Date.now()}-${Math.random().toString(36).substring(2)}.tmp`)
      const fileWriteStream = createWriteStream(tempFilePath)
      const nodeStream = Readable.fromWeb(req.body as unknown as import('stream/web').ReadableStream)

      try {
        await pipeline(nodeStream, fileWriteStream)
      } catch (err) {
        logger.error('Failed to write temp file', err as Error)
        if (existsSync(tempFilePath)) {
          await unlink(tempFilePath).catch(() => {})
        }
        return apiError('Upload streaming failed', HTTP_STATUS.INTERNAL_SERVER_ERROR)
      }
    } else {
      const formData = await req.formData()
      const uploadedFile = formData.get('file') as File
      if (!uploadedFile) {
        return apiError('No file provided', HTTP_STATUS.BAD_REQUEST)
      }
      fileName = uploadedFile.name
      fileSize = uploadedFile.size
      fileType = uploadedFile.type || 'application/octet-stream'
      targetPath = normalizePath((formData.get('path') as string) || '/')
      subpath = (formData.get('subpath') as string) || ''
      fullpath = (formData.get('fullpath') as string) || ''

      password = formData.get('password') as string | null
      visibility = ((formData.get('visibility') as string) || 'PUBLIC') as FileVisibility
      expiresAt = formData.get('expiresAt') as string | null

      const bytes = await uploadedFile.arrayBuffer()
      fileStream = Readable.from(Buffer.from(bytes))
    }

    if (!fileName) {
      if (tempFilePath && existsSync(tempFilePath)) {
        await unlink(tempFilePath).catch(() => {})
      }
      return apiError('No file name provided', HTTP_STATUS.BAD_REQUEST)
    }

    if (auth.user?.role !== 'ADMIN' && auth.user?.role !== 'OWNER') {
      const config = await (await import('@/lib/config')).getConfig()
      const maxFileSize = config.settings.general.maxFileSize
      if (fileSize > maxFileSize) {
        if (tempFilePath && existsSync(tempFilePath)) {
          await unlink(tempFilePath).catch(() => {})
        }
        return apiError(`File exceeds the maximum file size limit of ${Math.round(maxFileSize / 1024 / 1024)}MB`, HTTP_STATUS.PAYLOAD_TOO_LARGE)
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
      if (tempFilePath && existsSync(tempFilePath)) {
        await unlink(tempFilePath).catch(() => {})
      }
      return apiError("You don't have permission to upload files inside this directory", HTTP_STATUS.FORBIDDEN)
    }

    const finalFileName = fullpath || (subpath ? `${subpath}/${fileName}` : fileName)
    const remotePath = normalizePath(`${targetPath}/${finalFileName}`)

    logger.info('upload targetPath=' + targetPath + ' subpath=' + subpath + ' fullpath=' + fullpath + ' fileName=' + fileName + ' remotePath=' + remotePath)

    try {
      if (tempFilePath) {
        await uploadFile(tempFilePath, remotePath)
      } else if (fileStream) {
        await uploadFile(fileStream, remotePath)
      }
    } finally {
      if (tempFilePath && existsSync(tempFilePath)) {
        await unlink(tempFilePath).catch(() => {})
      }
    }

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

    const userUrlId = auth.user!.urlId
    const existingFile = await prisma.file.findUnique({
      where: { path: remotePath },
      select: { urlPath: true }
    })

    const urlPath = existingFile?.urlPath && !existingFile.urlPath.startsWith('/api/files/serve')
      ? existingFile.urlPath
      : await generateUniqueUrlPath(userUrlId, fileName)

    await prisma.file.upsert({
      where: { path: remotePath },
      update: {
        size: fileSize,
        name: fileName,
        visibility,
        password: hashedPassword,
        expiresAt: parsedExpiresAt,
        urlPath,
      },
      create: {
        path: remotePath,
        name: fileName,
        urlPath,
        mimeType: fileType,
        size: fileSize,
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
      url: urlPath,
      name: fileName,
      size: fileSize,
      type: fileType,
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
    const pathParam = searchParams.get('path')

    if (!pathParam) {
      return apiError('File path is required', HTTP_STATUS.BAD_REQUEST)
    }
    const filePath = normalizePath(pathParam)

    if (auth.user?.role !== 'ADMIN' && auth.user?.role !== 'OWNER') {
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
    const { path: pathParam, name } = body

    if (!pathParam || !name) {
      return apiError('File path and new name are required', HTTP_STATUS.BAD_REQUEST)
    }
    const filePath = normalizePath(pathParam)

    if (auth.user?.role !== 'ADMIN' && auth.user?.role !== 'OWNER') {
      const file = await prisma.file.findUnique({ where: { path: filePath } })
      if (!file || file.userId !== auth.user.id) {
        return apiError("You don't have permission to modify or delete this file", HTTP_STATUS.FORBIDDEN)
      }
    }

    const parentDir = normalizePath(filePath.substring(0, filePath.lastIndexOf('/') + 1))
    const newPath = normalizePath(`${parentDir}/${name}`)

    await rename(filePath, newPath)

    // Update path, name and urlPath in DB
    const file = await prisma.file.findUnique({ where: { path: filePath } })
    let newUrlPath = `/api/files/serve?path=${encodeURIComponent(newPath)}`
    if (file) {
      const owner = await prisma.user.findUnique({ where: { id: file.userId } })
      if (owner) {
        newUrlPath = await generateUniqueUrlPath(owner.urlId, name)
      }
    }

    await prisma.file.updateMany({
      where: { path: filePath },
      data: {
        path: newPath,
        name: name,
        urlPath: newUrlPath
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
