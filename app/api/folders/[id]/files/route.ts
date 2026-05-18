import { listDir } from '@/lib/sftp'
import { HTTP_STATUS, apiError, apiResponse } from '@/lib/api/response'
import { requireAuth } from '@/lib/auth/api-auth'
import { loggers } from '@/lib/logger'

const logger = loggers.files

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(request)
    if (auth.response) return auth.response

    const { id } = await params
    const dirPath = decodeURIComponent(id)

    const entries = await listDir(dirPath)
    const files = entries
      .filter((e) => e.type === 'file')
      .map((e) => ({
        id: e.path,
        name: e.name,
        urlPath: e.path,
        mimeType: '',
        visibility: 'PUBLIC' as const,
        password: null,
        size: e.size,
        uploadedAt: e.modifyTime.toISOString(),
        views: 0,
        downloads: 0,
      }))

    return apiResponse(files)
  } catch (error) {
    logger.error('Error listing folder files', error as Error)
    return apiError('Failed to list files', HTTP_STATUS.INTERNAL_SERVER_ERROR)
  }
}
