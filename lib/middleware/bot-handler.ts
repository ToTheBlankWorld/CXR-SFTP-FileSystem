import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const BOT_PATTERNS = [
  'discordbot',
  'telegrambot',
  'twitterbot',
  'facebook',
  'linkedin',
]

export function handleBotRequest(
  request: NextRequest
): NextResponse | null {
  const userAgent = request.headers.get('user-agent')?.toLowerCase() || ''
  const isBot = BOT_PATTERNS.some((pattern) => userAgent.includes(pattern))

  if (isBot && request.nextUrl.pathname.match(/\.\w+$/)) {
    const rawUrl = new URL(request.url)
    rawUrl.pathname = '/api/files/serve'
    rawUrl.searchParams.set('path', request.nextUrl.pathname)
    return NextResponse.rewrite(rawUrl)
  }

  return null
}
