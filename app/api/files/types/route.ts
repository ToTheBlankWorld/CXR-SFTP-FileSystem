import { HTTP_STATUS, apiError, apiResponse } from '@/lib/api/response'
import { requireAuth } from '@/lib/auth/api-auth'
import { loggers } from '@/lib/logger'

const logger = loggers.files

const COMMON_TYPES = [
  'application/javascript', 'application/json', 'application/pdf',
  'application/zip', 'application/x-tar', 'application/gzip',
  'audio/mpeg', 'audio/wav', 'audio/ogg',
  'image/png', 'image/jpeg', 'image/gif', 'image/svg+xml', 'image/webp',
  'text/plain', 'text/html', 'text/css',
  'video/mp4', 'video/webm', 'video/quicktime',
]

export async function GET(request: Request) {
  try {
    const auth = await requireAuth(request)
    if (auth.response) return auth.response

    return apiResponse({ types: COMMON_TYPES })
  } catch (error) {
    logger.error('Error fetching file types:', error as Error)
    return apiError('Failed to fetch file types', HTTP_STATUS.INTERNAL_SERVER_ERROR)
  }
}
