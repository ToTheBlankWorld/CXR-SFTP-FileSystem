import { listDir, uploadFile, deleteFile, rename } from '@/lib/sftp'
import { getMimeType } from '@/lib/sftp/mime'
import { HTTP_STATUS, apiError, apiResponse, paginatedResponse } from '@/lib/api/response'
import { requireAuth } from '@/lib/auth/api-auth'
import { prisma } from '@/lib/database/prisma'
import { loggers } from '@/lib/logger'

const logger = loggers.files

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

    let entries = await listDir(dirPath)

    logger.info('listDir ' + dirPath + ' entries=' + entries.length + ' names=[' + entries.map(e => e.name).join(',') + ']')

    if (search) {
      const q = search.toLowerCase()
      entries = entries.filter((e) => e.name.toLowerCase().includes(q))
    }

    const files = entries
      .filter((e) => e.type === 'file')
      .map((e) => ({
        id: e.path,
        name: e.name,
        urlPath: `/api/files/serve?path=${encodeURIComponent(e.path)}`,
        mimeType: getMimeType(e.name),
        visibility: 'PUBLIC' as const,
        password: null,
        size: e.size,
        uploadedAt: e.modifyTime.toISOString(),
        views: 0,
        downloads: 0,
      }))

    switch (sortBy) {
      case 'oldest':
        files.sort((a, b) => a.uploadedAt.localeCompare(b.uploadedAt)); break
      case 'largest':
        files.sort((a, b) => b.size - a.size); break
      case 'smallest':
        files.sort((a, b) => a.size - b.size); break
      case 'name':
        files.sort((a, b) => a.name.localeCompare(b.name)); break
      default:
        files.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))
    }

    const total = files.length
    const start = (page - 1) * limit
    const pagedFiles = files.slice(start, start + limit)

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

    const bytes = await uploadedFile.arrayBuffer()
    const buffer = Buffer.from(bytes)
    const fileName = fullpath || (subpath ? `${subpath}/${uploadedFile.name}` : uploadedFile.name)
    const remotePath = `${targetPath}/${fileName}`.replace(/\/+/g, '/')

    logger.info('upload targetPath=' + targetPath + ' subpath=' + subpath + ' fullpath=' + fullpath + ' fileName=' + uploadedFile.name + ' remotePath=' + remotePath)

    await uploadFile(buffer, remotePath)

    const urlPath = `/api/files/serve?path=${encodeURIComponent(remotePath)}`
    await prisma.file.upsert({
      where: { path: remotePath },
      update: { size: uploadedFile.size, name: uploadedFile.name },
      create: {
        path: remotePath,
        name: uploadedFile.name,
        urlPath,
        mimeType: uploadedFile.type || 'application/octet-stream',
        size: uploadedFile.size,
        visibility: 'PUBLIC',
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
