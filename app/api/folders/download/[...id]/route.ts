import { PassThrough } from 'stream'

import { downloadFile, listAllFilesRecursive } from '@/lib/sftp'
import { getAuthenticatedUser } from '@/lib/auth/api-auth'
import { loggers } from '@/lib/logger'
import { checkFolderAccess } from '@/lib/folders/access'
import { normalizePath } from '@/lib/utils'

const logger = loggers.files

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string[] }> }
) {
  try {
    const user = await getAuthenticatedUser(request)
    const session = user ? { user } : null

    const { id } = await params
    const folderPath = normalizePath('/' + id.map(decodeURIComponent).join('/'))

    const folderPasswordHeader = request.headers.get('x-folder-password')
    const { searchParams } = new URL(request.url)
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

    const accessResult = await checkFolderAccess(folderPath, session, providedPasswords)
    if (!accessResult.allowed) {
      if (accessResult.reason === 'password_required' || accessResult.reason === 'password_invalid') {
        return new Response(JSON.stringify({ error: accessResult.reason }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return new Response(null, { status: 404 })
    }

    const files = await listAllFilesRecursive(folderPath)
    if (files.length === 0) {
      return new Response('Folder is empty', { status: 404 })
    }

    const { ZipArchive } = await import('archiver')
    const archive = new ZipArchive({ zlib: { level: 1 } })
    const passThrough = new PassThrough()
    archive.pipe(passThrough)

    const folderName = folderPath.split('/').filter(Boolean).pop() || 'download'

    for (const file of files) {
      const relPath = file.path.startsWith(folderPath)
        ? file.path.slice(folderPath.length).replace(/^\//, '')
        : file.name

      const buffer = await downloadFile(file.path)
      archive.append(buffer, { name: relPath })
    }

    archive.finalize()

    return new Response(passThrough as unknown as ReadableStream, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(folderName)}.zip"`,
        'Transfer-Encoding': 'chunked',
      },
    })
  } catch (error) {
    logger.error('Error downloading folder', error as Error)
    return new Response('Failed to download folder', { status: 500 })
  }
}
