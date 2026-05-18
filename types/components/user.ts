export interface User {
  id: string
  name: string | null
  email: string | null
  image: string | null
  role: 'ADMIN' | 'USER'
  urlId: string
  vanityId: string | null
  fileCount: number
  shortUrlCount: number
}

export interface ProfileClientProps {
  user: User
  isAdmin: boolean
}

export interface PaginationData {
  current: number
  total: number
  totalPages: number
  perPage: number
}

export interface UsersResponse {
  users: User[]
  pagination: PaginationData
}

export interface UserFormData {
  name: string
  email: string
  role: 'ADMIN' | 'USER'
  quota?: number
}
