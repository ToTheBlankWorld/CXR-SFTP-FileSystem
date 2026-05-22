import { compare } from 'bcryptjs'

export type FileAccessInfo = {
  visibility: 'PUBLIC' | 'PRIVATE' | 'USERS_AND_ADMINS' | 'USER_ONLY'
  userId: string
  password: string | null
  uploaderRole?: string | null
  expiresAt?: Date | string | null
}

export type SessionInfo = {
  user?: { id: string; role?: string }
} | null

export type FileAccessAllowed = {
  allowed: true
  isOwner: boolean
  isAdmin: boolean
}

export type FileAccessDenied = {
  allowed: false
  reason: 'private' | 'password_required' | 'password_invalid' | 'expired'
  status: 401 | 403 | 404
}

export type FileAccessResult = FileAccessAllowed | FileAccessDenied

export async function checkFileAccess(
  file: FileAccessInfo,
  session: SessionInfo,
  providedPassword?: string | null
): Promise<FileAccessResult> {
  const isOwner = session?.user?.id === file.userId
  const isAdmin = session?.user?.role === 'ADMIN'

  // 1. Expiration check
  if (file.expiresAt && new Date(file.expiresAt) < new Date()) {
    return { allowed: false, reason: 'expired', status: 404 }
  }

  // 2. Visibility check
  // Admin-uploaded file fallback: if uploader is admin, only admins can view it (unless isOwner)
  if (file.uploaderRole === 'ADMIN' && !isAdmin && !isOwner) {
    return { allowed: false, reason: 'private', status: 404 }
  }

  if (file.visibility === 'PRIVATE' && !isOwner && !isAdmin) {
    return { allowed: false, reason: 'private', status: 404 }
  }

  if (file.visibility === 'USERS_AND_ADMINS' && !session?.user) {
    return { allowed: false, reason: 'private', status: 404 }
  }

  if (file.visibility === 'USER_ONLY' && !session?.user) {
    return { allowed: false, reason: 'private', status: 404 }
  }

  // 3. Password check (applies to EVERYONE including owner and admin)
  if (file.password) {
    if (!providedPassword) {
      return { allowed: false, reason: 'password_required', status: 401 }
    }

    const isPasswordValid = await compare(providedPassword, file.password)
    if (!isPasswordValid) {
      return { allowed: false, reason: 'password_invalid', status: 401 }
    }
  }

  return { allowed: true, isOwner, isAdmin }
}
