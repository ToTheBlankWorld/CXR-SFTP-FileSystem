import { getFileStream, getFileInfo } from '@/lib/sftp'
import { getMimeType } from '@/lib/sftp/mime'
import { loggers } from '@/lib/logger'
import { getAuthenticatedUser } from '@/lib/auth/api-auth'
import { prisma } from '@/lib/database/prisma'
import { checkFolderAccess } from '@/lib/folders/access'
import { checkFileAccess, FileAccessInfo } from '@/lib/files/access'
import { normalizePath } from '@/lib/utils'
import { resolveFileUrlPath } from '@/lib/files/resolve'

const logger = loggers.files

export async function GET(request: Request) {
  try {
    console.log(`[Serve Route] Incoming request: url=${request.url}`)
    console.log(`[Serve Route] Headers: x-urlpath=${request.headers.get('x-urlpath')}`)
    const { searchParams } = new URL(request.url)
    let urlPath = searchParams.get('urlPath')
    let filePath = searchParams.get('path')

    if (!urlPath && !filePath) {
      // Fallback: check custom request header
      urlPath = request.headers.get('x-urlpath')

      // Fallback: parse original pathname if searchParams / headers are not present
      if (!urlPath) {
        const reqUrl = new URL(request.url)
        const canonicalMatch = reqUrl.pathname.match(
          /^\/([A-Za-z0-9][A-Za-z0-9-]{1,31}[A-Za-z0-9])\/([^\/]+\.[^\/]+)(?:\/(raw|direct))?$/
        )
        if (canonicalMatch) {
          const [_, userUrlId, filename] = canonicalMatch
          urlPath = `/${userUrlId}/${filename}`
        }
      }
    }

    let dbFile = null
    if (urlPath) {
      let resolvedUrlPath = urlPath
      const parts = urlPath.split('/').filter(Boolean)
      if (parts.length >= 2) {
        const userUrlId = parts[0]
        const filename = parts.slice(1).join('/')
        const canonical = await resolveFileUrlPath(userUrlId, filename)
        if (canonical) {
          resolvedUrlPath = canonical
        }
      }

      dbFile = await prisma.file.findUnique({
        where: { urlPath: resolvedUrlPath },
        include: { user: { select: { role: true } } },
      })
      if (!dbFile) {
        logger.info(`serve GET urlPath=${urlPath} resolvedUrlPath=${resolvedUrlPath} file not found in DB`)
        return new Response(`File not found in database for path: ${resolvedUrlPath}`, { status: 404 })
      }
      filePath = normalizePath(dbFile.path)
    } else if (filePath) {
      filePath = normalizePath(filePath)
      dbFile = await prisma.file.findUnique({
        where: { path: filePath },
        include: { user: { select: { role: true } } },
      })
    }

    if (!filePath) {
      return new Response('File path required', { status: 400 })
    }

    const info = await getFileInfo(filePath)
    if (!info || info.type !== 'file') {
      return new Response(`File not found in SFTP/storage for path: ${filePath}`, { status: 404 })
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
      return new Response(`Folder access denied: ${folderAccess.reason}`, { status: 404 })
    }

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

    const checkOnly = searchParams.get('checkOnly') === 'true'
    const isDirect = searchParams.get('direct') === 'true'

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
      return new Response(`File access denied: ${fileAccess.reason}`, { status: 404 })
    }

    if (checkOnly) {
      return new Response(JSON.stringify({ allowed: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (isDirect) {
      const passwordVal = searchParams.get('password')
      const targetUrl = `/api/files/serve?path=${encodeURIComponent(filePath)}` + (passwordVal ? `&password=${encodeURIComponent(passwordVal)}` : '')
      return new Response(JSON.stringify({ url: targetUrl }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const mimeType = getMimeType(info.name)
    const isVideo = mimeType.startsWith('video/')
    const range = request.headers.get('range')
    const isDownload = searchParams.get('download') === 'true'
    const contentDisposition = isDownload
      ? `attachment; filename="${encodeURIComponent(info.name)}"`
      : `inline; filename="${encodeURIComponent(info.name)}"`

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
          'Content-Disposition': contentDisposition,
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
        'Content-Disposition': contentDisposition,
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
