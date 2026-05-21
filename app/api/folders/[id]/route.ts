import { deleteDir, rename } from '@/lib/sftp'
import { HTTP_STATUS, apiError, apiResponse } from '@/lib/api/response'
import { requireAuth } from '@/lib/auth/api-auth'
import { prisma } from '@/lib/database/prisma'
import { loggers } from '@/lib/logger'

const logger = loggers.files

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(request)
    if (auth.response) return auth.response

    const { id } = await params
    const folderPath = decodeURIComponent(id)
    const body = await request.json()
    const { name } = body

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return apiError('Folder name is required', HTTP_STATUS.BAD_REQUEST)
    }

    const folder = await prisma.folder.findUnique({ where: { id: folderPath } })
    if (auth.user?.role !== 'ADMIN') {
      if (folder && folder.userId !== auth.user.id) {
        return apiError("You don't have permission to modify or delete this folder", HTTP_STATUS.FORBIDDEN)
      }
      
      // Fallback check for legacy folders
      const files = await prisma.file.findMany({
        where: { path: { startsWith: folderPath } },
        select: { userId: true }
      })
      if (files.some((f) => f.userId !== auth.user.id)) {
        return apiError("You don't have permission to modify or delete this folder", HTTP_STATUS.FORBIDDEN)
      }
    }

    const parentDir = folderPath.substring(0, folderPath.lastIndexOf('/') + 1)
    const newPath = `${parentDir}${name.trim()}`

    await rename(folderPath, newPath)

    // Update folder DB records
    const cleanParentId = parentDir === '/' ? null : parentDir.replace(/\/$/, '')
    await prisma.folder.upsert({
      where: { id: folderPath },
      update: { id: newPath, name: name.trim(), parentId: cleanParentId },
      create: { id: newPath, name: name.trim(), userId: folder?.userId || auth.user!.id, parentId: cleanParentId }
    })

    // Update nested subfolders
    const subfolders = await prisma.folder.findMany({
      where: { id: { startsWith: `${folderPath}/` } }
    })
    for (const sub of subfolders) {
      const newSubPath = sub.id.replace(folderPath, newPath)
      const newSubParentId = sub.parentId ? sub.parentId.replace(folderPath, newPath) : null
      await prisma.folder.update({
        where: { id: sub.id },
        data: { id: newSubPath, parentId: newSubParentId }
      })
    }

    // Update file paths in DB
    const files = await prisma.file.findMany({
      where: { path: { startsWith: `${folderPath}/` } }
    })
    for (const file of files) {
      const newFilePath = file.path.replace(folderPath, newPath)
      const newUrlPath = `/api/files/serve?path=${encodeURIComponent(newFilePath)}`
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
    return apiError('Failed to rename folder', HTTP_STATUS.INTERNAL_SERVER_ERROR)
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(request)
    if (auth.response) return auth.response

    const { id } = await params
    const folderPath = decodeURIComponent(id)

    const folder = await prisma.folder.findUnique({ where: { id: folderPath } })
    if (auth.user?.role !== 'ADMIN') {
      if (folder && folder.userId !== auth.user.id) {
        return apiError("You don't have permission to modify or delete this folder", HTTP_STATUS.FORBIDDEN)
      }
      
      // Fallback check
      const files = await prisma.file.findMany({
        where: { path: { startsWith: folderPath } },
        select: { userId: true },
      })
      if (files.length > 0 && files.some((f) => f.userId !== auth.user.id)) {
        return apiError("You don't have permission to modify or delete this folder", HTTP_STATUS.FORBIDDEN)
      }
    }

    await deleteDir(folderPath)
    await prisma.file.deleteMany({ where: { path: { startsWith: folderPath } } })

    // Clean up folder mappings in DB
    await prisma.folder.deleteMany({
      where: {
        OR: [
          { id: folderPath },
          { id: { startsWith: `${folderPath}/` } }
        ]
      }
    })

    return apiResponse({ success: true })
  } catch (error) {
    logger.error('Error deleting folder', error as Error)
    return apiError('Failed to delete folder', HTTP_STATUS.INTERNAL_SERVER_ERROR)
  }
}
