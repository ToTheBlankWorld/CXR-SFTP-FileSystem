import { deleteDir, rename } from '@/lib/sftp'
import { HTTP_STATUS, apiError, apiResponse } from '@/lib/api/response'
import { requireAuth } from '@/lib/auth/api-auth'
import { prisma } from '@/lib/database/prisma'
import { loggers } from '@/lib/logger'
import { normalizePath } from '@/lib/utils'

const logger = loggers.files

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string[] }> }
) {
  try {
    const auth = await requireAuth(request)
    if (auth.response) return auth.response

    const { id } = await params
    const folderPath = normalizePath('/' + id.map(decodeURIComponent).join('/'))
    const body = await request.json()
    const { name } = body

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return apiError('Folder name is required', HTTP_STATUS.BAD_REQUEST)
    }

    const folder = await prisma.folder.findFirst({ where: { id: { equals: folderPath, mode: 'insensitive' } } })
    if (!folder) {
      return apiError('Folder not found', HTTP_STATUS.NOT_FOUND)
    }

    const resolvedPath = folder.id

    if (auth.user?.role !== 'ADMIN' && auth.user?.role !== 'OWNER') {
      if (folder.teamLeaderId) {
        if (folder.teamLeaderId !== auth.user.id) {
          return apiError("Only the Team Leader has permission to modify or delete this folder", HTTP_STATUS.FORBIDDEN)
        }
      } else {
        if (folder.userId !== auth.user.id) {
          return apiError("You don't have permission to modify or delete this folder", HTTP_STATUS.FORBIDDEN)
        }
      }
    }

    const parentDir = normalizePath(resolvedPath.substring(0, resolvedPath.lastIndexOf('/') + 1))
    const newPath = normalizePath(`${parentDir}/${name.trim()}`)

    await rename(resolvedPath, newPath)

    // Update folder DB records
    const cleanParentId = parentDir === '/' ? null : parentDir.replace(/\/$/, '')
    await prisma.folder.upsert({
      where: { id: resolvedPath },
      update: { id: newPath, name: name.trim(), parentId: cleanParentId },
      create: { id: newPath, name: name.trim(), userId: folder?.userId || auth.user!.id, parentId: cleanParentId }
    })

    // Update nested subfolders
    const subfolders = await prisma.folder.findMany({
      where: { id: { startsWith: `${resolvedPath}/` } }
    })
    for (const sub of subfolders) {
      const newSubPath = normalizePath(sub.id.replace(resolvedPath, newPath))
      const newSubParentId = sub.parentId ? normalizePath(sub.parentId.replace(resolvedPath, newPath)) : null
      await prisma.folder.update({
        where: { id: sub.id },
        data: { id: newSubPath, parentId: newSubParentId }
      })
    }

    // Update file paths in DB
    const files = await prisma.file.findMany({
      where: { path: { startsWith: `${resolvedPath}/` } }
    })
    for (const file of files) {
      const newFilePath = normalizePath(file.path.replace(resolvedPath, newPath))
      const isLegacy = file.urlPath.startsWith('/api/files/serve')
      const newUrlPath = isLegacy
        ? `/api/files/serve?path=${encodeURIComponent(newFilePath)}`
        : file.urlPath
      await prisma.file.update({
        where: { id: file.id },
        data: { path: newFilePath, urlPath: newUrlPath }
      })
    }

    return apiResponse({
      id: newPath,
      name: name.trim(),
      userId: folder?.userId || auth.user?.id || '',
      parentId: parentDir === '/' ? null : parentDir.replace(/\/$/, ''),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      fileCount: 0,
    })
  } catch (error) {
    logger.error('Error renaming folder', error as Error)
    const errMessage = (error as Error).message || ''
    if (
      errMessage.toLowerCase().includes('permission') ||
      errMessage.toLowerCase().includes('denied') ||
      errMessage.toLowerCase().includes('unauthorized')
    ) {
      return apiError("You don't have permission to modify or delete this folder", HTTP_STATUS.FORBIDDEN)
    }
    return apiError('Failed to rename folder', HTTP_STATUS.INTERNAL_SERVER_ERROR)
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string[] }> }
) {
  try {
    const auth = await requireAuth(request)
    if (auth.response) return auth.response

    const { id } = await params
    const folderPath = normalizePath('/' + id.map(decodeURIComponent).join('/'))

    const folder = await prisma.folder.findFirst({ where: { id: { equals: folderPath, mode: 'insensitive' } } })
    if (!folder) {
      return apiError('Folder not found', HTTP_STATUS.NOT_FOUND)
    }

    const resolvedPath = folder.id

    if (auth.user?.role !== 'ADMIN' && auth.user?.role !== 'OWNER') {
      if (folder.teamLeaderId) {
        if (folder.teamLeaderId !== auth.user.id) {
          return apiError("Only the Team Leader has permission to modify or delete this folder", HTTP_STATUS.FORBIDDEN)
        }
      } else {
        if (folder.userId !== auth.user.id) {
          return apiError("You don't have permission to modify or delete this folder", HTTP_STATUS.FORBIDDEN)
        }
      }
    }

    await deleteDir(resolvedPath)
    await prisma.file.deleteMany({ where: { path: { startsWith: resolvedPath } } })

    // Clean up folder mappings in DB
    await prisma.folder.deleteMany({
      where: {
        OR: [
          { id: resolvedPath },
          { id: { startsWith: `${resolvedPath}/` } }
        ]
      }
    })

    return apiResponse({ success: true })
  } catch (error) {
    logger.error('Error deleting folder', error as Error)
    const errMessage = (error as Error).message || ''
    if (
      errMessage.toLowerCase().includes('permission') ||
      errMessage.toLowerCase().includes('denied') ||
      errMessage.toLowerCase().includes('unauthorized')
    ) {
      return apiError("You don't have permission to modify or delete this folder", HTTP_STATUS.FORBIDDEN)
    }
    return apiError('Failed to delete folder', HTTP_STATUS.INTERNAL_SERVER_ERROR)
  }
}
