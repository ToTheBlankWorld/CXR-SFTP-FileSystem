export const FILE_URL_PATTERN = /^\/[A-Za-z0-9][A-Za-z0-9-]{1,31}[A-Za-z0-9]\/[^\/]+\.[^\/]+(?:\/raw|\/direct)?$/

export const PUBLIC_PATHS = [
  '/api/auth',
  '/_next',
  '/favicon.ico',
  '/icon.svg',
  '/api/setup/check',
  '/api/health',
  '/api/files/serve',
  '/auth/login',
  '/auth/register',
  '/banner.png',
  '/fonts',
]
