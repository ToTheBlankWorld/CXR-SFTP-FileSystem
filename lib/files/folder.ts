import { prisma } from '@/lib/database/prisma'

export async function getFolderPathSegments(
  folderId: string,
  _userId: string
): Promise<string[]> {
  const segments: string[] = []
  let currentId: string | null = folderId

  while (currentId) {
    const folder: { name: string; parentId: string | null } | null =
      await prisma.folder.findUnique({
        where: { id: currentId },
        select: { name: true, parentId: true },
      })
    if (!folder) break
    segments.unshift(folder.name)
    currentId = folder.parentId
  }

  return segments
}

export async function resolveFolderStoragePath(
  userUrlId: string,
  folderId: string | null,
  userId: string
): Promise<string> {
  const base = `uploads/${userUrlId}`
  if (!folderId) return base
  const segments = await getFolderPathSegments(folderId, userId)
  if (segments.length === 0) return base
  return `${base}/${segments.join('/')}`
}

export async function resolveFolderUrlPath(
  userUrlId: string,
  folderId: string | null,
  userId: string
): Promise<string> {
  const base = `/${userUrlId}`
  if (!folderId) return base
  const segments = await getFolderPathSegments(folderId, userId)
  if (segments.length === 0) return base
  return `${base}/${segments.map(encodeURIComponent).join('/')}`
}
