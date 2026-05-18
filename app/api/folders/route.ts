import { listDir, mkdir } from '@/lib/sftp'
import { HTTP_STATUS, apiError, apiResponse } from '@/lib/api/response'
import { requireAuth } from '@/lib/auth/api-auth'
import { loggers } from '@/lib/logger'

const logger = loggers.files

export async function GET(request: Request) {
  try {
    const auth = await requireAuth(request)
    if (auth.response) return auth.response

    const { searchParams } = new URL(request.url)
    const parentPath = searchParams.get('parentId') || '/'

    const entries = await listDir(parentPath)
    const folders = entries
      .filter((e) => e.type === 'directory')
      .map((e) => ({
        id: e.path,
        name: e.name,
        userId: auth.user?.id || '',
        parentId: parentPath === '/' ? null : parentPath,
        createdAt: e.modifyTime.toISOString(),
        updatedAt: e.modifyTime.toISOString(),
        fileCount: 0,
      }))

    return apiResponse(folders)
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
    const { name, parentId } = body

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return apiError('Folder name is required', HTTP_STATUS.BAD_REQUEST)
    }

    const cleanName = name.trim()
    const parentPath = parentId || '/'
    const newPath = `${parentPath}/${cleanName}`.replace(/\/+/g, '/')

    await mkdir(newPath)

    return apiResponse({
      id: newPath,
      name: cleanName,
      userId: auth.user?.id || '',
      parentId: parentPath === '/' ? null : parentPath,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      fileCount: 0,
    })
  } catch (error) {
    logger.error('Error creating folder', error as Error)
    return apiError('Failed to create folder', HTTP_STATUS.INTERNAL_SERVER_ERROR)
  }
}
