import { compare } from 'bcryptjs'
import { prisma } from '@/lib/database/prisma'

export type SessionInfo = {
  user?: { id: string; role?: string }
} | null

export type FolderAccessResult =
  | { allowed: true }
  | { allowed: false; reason: 'private' | 'password_required' | 'password_invalid' | 'expired'; status: 401 | 403 | 404 }

/**
 * Checks access to a folder by looking up all folders in its path hierarchy
 * and validating visibility, passwords, and expiration dates.
 */
export async function checkFolderAccess(
  folderPath: string,
  session: SessionInfo,
  providedPasswords?: Record<string, string> | string | null
): Promise<FolderAccessResult> {
  const isOwner = (userId: string) => session?.user?.id === userId
  const isAdmin = session?.user?.role === 'ADMIN' || session?.user?.role === 'OWNER'

  // Normalize path and generate prefix segments
  const cleanPath = ('/' + folderPath).replace(/\/+/g, '/').replace(/\/$/, '')
  if (cleanPath === '' || cleanPath === '/') {
    return { allowed: true }
  }

  const parts = cleanPath.split('/').filter(Boolean)
  const prefixPaths: string[] = []
  let current = ''
  for (const part of parts) {
    current = `${current}/${part}`
    prefixPaths.push(current)
  }

  // Fetch all existing folder definitions in the hierarchy from the database
  const folders = await prisma.folder.findMany({
    where: { id: { in: prefixPaths } },
    orderBy: { id: 'asc' }, // Order root-to-leaf
  })

  // Check each folder segment in the hierarchy
  for (const folder of folders) {
    // 1. Expiration check
    if (folder.expiresAt && new Date(folder.expiresAt) < new Date()) {
      return { allowed: false, reason: 'expired', status: 404 }
    }

    // 2. Visibility check
    const folderOwner = isOwner(folder.userId)
    if (folder.visibility === 'PRIVATE' && !folderOwner) {
      return { allowed: false, reason: 'private', status: 404 }
    }
    if (folder.visibility === 'USERS_AND_ADMINS' && !session?.user) {
      return { allowed: false, reason: 'private', status: 404 }
    }
    if (folder.visibility === 'USER_ONLY') {
      if (!session?.user || (isAdmin && !folderOwner)) {
        return { allowed: false, reason: 'private', status: 404 }
      }
    }

    // 3. Password check (applies to EVERYONE, including owner and admin)
    if (folder.password) {
      let pwdToTest: string | undefined

      if (typeof providedPasswords === 'string') {
        // If it's a single string, only apply it if it's the exact folder being accessed, or check it
        pwdToTest = providedPasswords
      } else if (providedPasswords && typeof providedPasswords === 'object') {
        pwdToTest = providedPasswords[folder.id]
      }

      if (!pwdToTest) {
        return { allowed: false, reason: 'password_required', status: 401 }
      }

      const isPasswordValid = await compare(pwdToTest, folder.password)
      if (!isPasswordValid) {
        return { allowed: false, reason: 'password_invalid', status: 401 }
      }
    }
  }

  return { allowed: true }
}
