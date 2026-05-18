import { getFileStream, getFileInfo } from '@/lib/sftp'
import { getMimeType } from '@/lib/sftp/mime'
import { loggers } from '@/lib/logger'

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
