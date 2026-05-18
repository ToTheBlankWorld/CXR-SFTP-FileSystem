import { deleteDir, rename } from '@/lib/sftp'
import { HTTP_STATUS, apiError, apiResponse } from '@/lib/api/response'
import { requireAuth } from '@/lib/auth/api-auth'
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

    const parentDir = folderPath.substring(0, folderPath.lastIndexOf('/') + 1)
    const newPath = `${parentDir}${name.trim()}`

    await rename(folderPath, newPath)

    return apiResponse({
      id: newPath,
      name: name.trim(),
      userId: auth.user?.id || '',
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

    await deleteDir(folderPath)

    return apiResponse({ success: true })
  } catch (error) {
    logger.error('Error deleting folder', error as Error)
    return apiError('Failed to delete folder', HTTP_STATUS.INTERNAL_SERVER_ERROR)
  }
}
