export interface FolderType {
  id: string
  name: string
  userId: string
  parentId: string | null
  createdAt: string
  updatedAt: string
  fileCount: number
  size?: number
  visibility?: 'PUBLIC' | 'PRIVATE' | 'USERS_AND_ADMINS' | 'USER_ONLY' | 'TEAM'
  isMember?: boolean
  teamLeaderId?: string | null
}

export interface FolderMemberInfo {
  id: string
  name: string | null
  email: string | null
  role: string
  image: string | null
  addedAt: string
}

export interface FolderMembersResponse {
  folderId: string
  visibility: string
  ownerId: string
  teamLeaderId?: string | null
  owner?: {
    id: string
    name: string | null
    email: string | null
    role: string
    image: string | null
  } | null
  members: FolderMemberInfo[]
}

export interface CreateFolderRequest {
  name: string
  parentId?: string | null
}

export interface UpdateFolderRequest {
  name?: string
  parentId?: string | null
}
