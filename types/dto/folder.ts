export interface FolderType {
  id: string
  name: string
  userId: string
  parentId: string | null
  createdAt: string
  updatedAt: string
  fileCount: number
}

export interface CreateFolderRequest {
  name: string
  parentId?: string | null
}

export interface UpdateFolderRequest {
  name?: string
  parentId?: string | null
}
