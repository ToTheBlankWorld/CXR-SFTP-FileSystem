export function normalizePath(p: string): string {
  if (!p || p === '/') return '/'
  // Replace backslashes with forward slashes and consolidate duplicate slashes
  let normalized = p.replace(/\\/g, '/').replace(/\/+/g, '/')
  if (!normalized.startsWith('/')) {
    normalized = '/' + normalized
  }
  if (normalized.endsWith('/') && normalized.length > 1) {
    normalized = normalized.slice(0, -1)
  }
  return normalized
}
