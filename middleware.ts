import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

import { checkAuthentication } from './lib/middleware/auth-checker'
import { handleBotRequest } from './lib/middleware/bot-handler'
import { FILE_URL_PATTERN, PUBLIC_PATHS } from './lib/middleware/constants'

const CANONICAL_URL_PATTERN = /^\/([A-Za-z0-9][A-Za-z0-9-]{1,31}[A-Za-z0-9])\/([^\/]+\.[^\/]+)(?:\/(raw|direct))?$/
const API_CANONICAL_URL_PATTERN = /^\/api\/files\/([A-Za-z0-9][A-Za-z0-9-]{1,31}[A-Za-z0-9])\/([^\/]+\.[^\/]+)$/

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  console.log(`[Middleware] Path: ${pathname}`)

  const canonicalMatch = pathname.match(CANONICAL_URL_PATTERN)
  if (canonicalMatch) {
    const [_, userUrlId, filename, suffix] = canonicalMatch
    console.log(`[Middleware] Canonical match: userUrlId=${userUrlId}, filename=${filename}, suffix=${suffix}`)
    if (suffix === 'raw' || suffix === 'direct') {
      const url = request.nextUrl.clone()
      url.pathname = '/api/files/serve'
      url.searchParams.set('urlPath', `/${userUrlId}/${filename}`)
      if (suffix === 'raw') {
        url.searchParams.set('raw', 'true')
      } else if (suffix === 'direct') {
        url.searchParams.set('direct', 'true')
      }
      console.log(`[Middleware] Rewriting raw/direct to: ${url.pathname}${url.search}`)
      return NextResponse.rewrite(url)
    }
    // For the preview page itself, bypass auth redirect so guest view works
    return NextResponse.next()
  }

  const apiCanonicalMatch = pathname.match(API_CANONICAL_URL_PATTERN)
  if (apiCanonicalMatch) {
    const [_, userUrlId, filename] = apiCanonicalMatch
    const url = request.nextUrl.clone()
    url.pathname = '/api/files/serve'
    url.searchParams.set('urlPath', `/${userUrlId}/${filename}`)
    return NextResponse.rewrite(url)
  }

  if (request.nextUrl.pathname.startsWith('/u/')) {
    return NextResponse.next()
  }

  if (
    PUBLIC_PATHS.some((path: string) =>
      request.nextUrl.pathname.startsWith(path)
    )
  ) {
    return NextResponse.next()
  }

  const botResponse = handleBotRequest(request)
  if (botResponse) return botResponse

  if (
    request.nextUrl.pathname.startsWith('/setup') ||
    request.nextUrl.pathname.startsWith('/api/setup')
  ) {
    return NextResponse.next()
  }

  const authResponse = await checkAuthentication(request)
  if (authResponse) return authResponse

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
