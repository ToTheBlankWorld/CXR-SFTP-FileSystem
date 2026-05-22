import { getFileStream, getFileInfo } from '@/lib/sftp'
import { getMimeType } from '@/lib/sftp/mime'
import { loggers } from '@/lib/logger'
import { getAuthenticatedUser } from '@/lib/auth/api-auth'
import { prisma } from '@/lib/database/prisma'
import { checkFolderAccess } from '@/lib/folders/access'
import { checkFileAccess, FileAccessInfo } from '@/lib/files/access'

const logger = loggers.files

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const filePath = searchParams.get('path')

    if (!filePath) {
      return new Response('File path required', { status: 400 })
    }

    const info = await getFileInfo(filePath)
    if (!info || info.type !== 'file') {
      return new Response(null, { status: 404 })
    }

    // Get current session user
    const user = await getAuthenticatedUser(request)
    const session = user ? { user } : null

    // Determine passwords provided (could be in headers or query params)
    const folderPasswordHeader = request.headers.get('x-folder-password')
    const passwordParam = searchParams.get('password')
    let providedPasswords: Record<string, string> | string | null = null

    if (folderPasswordHeader) {
      try {
        const decoded = decodeURIComponent(folderPasswordHeader)
        providedPasswords = JSON.parse(decoded)
      } catch {
        providedPasswords = decodeURIComponent(folderPasswordHeader)
      }
    }
    if (!providedPasswords && passwordParam) {
      providedPasswords = passwordParam
    }

    // 1. Verify parent folder permissions
    const lastSlashIdx = filePath.lastIndexOf('/')
    const parentPath = lastSlashIdx !== -1 ? filePath.substring(0, lastSlashIdx) : '/'

    const folderAccess = await checkFolderAccess(parentPath, session, providedPasswords)
    if (!folderAccess.allowed) {
      if (folderAccess.reason === 'password_required' || folderAccess.reason === 'password_invalid') {
        return new Response(JSON.stringify({ error: folderAccess.reason }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return new Response(null, { status: 404 })
    }

    // 2. Verify file permissions
    const dbFile = await prisma.file.findUnique({
      where: { path: filePath },
      include: { user: { select: { role: true } } },
    })

    const fileAccessInfo: FileAccessInfo = dbFile
      ? {
          visibility: dbFile.visibility,
          userId: dbFile.userId,
          password: dbFile.password,
          uploaderRole: dbFile.user?.role,
          expiresAt: dbFile.expiresAt,
        }
      : {
          visibility: 'PUBLIC',
          userId: '',
          password: null,
          uploaderRole: null,
          expiresAt: null,
        }

    const fileAccess = await checkFileAccess(
      fileAccessInfo,
      session,
      passwordParam || (typeof providedPasswords === 'string' ? providedPasswords : null)
    )

    if (!fileAccess.allowed) {
      if (fileAccess.reason === 'password_required' || fileAccess.reason === 'password_invalid') {
        return new Response(JSON.stringify({ error: fileAccess.reason }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return new Response(null, { status: 404 })
    }

    const mimeType = getMimeType(info.name)
    const isVideo = mimeType.startsWith('video/')
    const range = request.headers.get('range')

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-')
      const start = parseInt(parts[0], 10)
      const end = parts[1] ? parseInt(parts[1], 10) : info.size - 1
      const chunkSize = end - start + 1

      const stream = await getFileStream(filePath, { start, end })

      return new Response(stream as unknown as ReadableStream, {
        status: 206,
        headers: {
          'Content-Range': `bytes ${start}-${end}/${info.size}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunkSize.toString(),
          'Content-Type': mimeType,
          'Content-Disposition': `inline; filename="${encodeURIComponent(info.name)}"`,
          'Content-Security-Policy': 'sandbox',
          'X-Content-Type-Options': 'nosniff',
          'Cache-Control': isVideo ? 'public, max-age=31536000' : 'no-cache',
        },
      })
    }

    const stream = await getFileStream(filePath)

    return new Response(stream as unknown as ReadableStream, {
      headers: {
        'Content-Type': mimeType,
        'Content-Disposition': `inline; filename="${encodeURIComponent(info.name)}"`,
        'Content-Security-Policy': 'sandbox',
        'X-Content-Type-Options': 'nosniff',
        'Accept-Ranges': 'bytes',
        'Content-Length': info.size.toString(),
        'Cache-Control': isVideo ? 'public, max-age=31536000' : 'no-cache',
      },
    })
  } catch (error) {
    logger.error('File serve error:', error as Error)
    return new Response(null, { status: 500 })
  }
}
