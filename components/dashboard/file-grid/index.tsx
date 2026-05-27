'use client'

import { useCallback, useEffect, useState } from 'react'

import Link from 'next/link'

import type {
  FileType,
  PaginationInfo,
  SortOption,
} from '@/types/components/file'
import { ChevronRight, FolderPlus, Home, RefreshCw, Upload, Lock, MessageSquare } from 'lucide-react'

import { FileCard } from '@/components/dashboard/file-card'
import { FileCardSkeleton } from '@/components/dashboard/file-grid/file-card-skeleton'
import { FileFilters } from '@/components/dashboard/file-grid/file-filters'
import {
  FileGridPagination,
  PaginationSkeleton,
} from '@/components/dashboard/file-grid/pagination'
import { SearchInput } from '@/components/dashboard/file-grid/search-input'
import { FolderCard } from '@/components/dashboard/folder-card'
import { TeamChatSheet } from '../team-chat-sheet'
import { EmptyPlaceholder } from '@/components/shared/empty-placeholder'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import { useFileFilters } from '@/hooks/use-file-filters'
import { useToast } from '@/hooks/use-toast'

export function FileGrid() {
  const [files, setFiles] = useState<FileType[]>([])
  const [folders, setFolders] = useState<
    {
      id: string
      name: string
      fileCount: number
      size?: number
      userId?: string
      visibility?: 'PUBLIC' | 'PRIVATE' | 'USERS_AND_ADMINS' | 'USER_ONLY' | 'TEAM'
      isMember?: boolean
      teamLeaderId?: string | null
    }[]
  >([])
  const [isLoading, setIsLoading] = useState(true)
  const [fileTypes] = useState<string[]>([])
  const [chatInfo, setChatInfo] = useState<{ isAllowed: boolean; chatFolderId?: string; chatFolderName?: string; ownerId?: string } | null>(null)
  const [isChatOpen, setIsChatOpen] = useState(false)
  const [isAccessDenied, setIsAccessDenied] = useState(false)
  const [paginationInfo, setPaginationInfo] = useState<PaginationInfo>({
    total: 0,
    pageCount: 0,
    page: 1,
    limit: 24,
  })

  const [currentPath, setCurrentPath] = useState<string>('/')
  const [folderPath, setFolderPath] = useState<{ id: string; name: string }[]>([])
  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')

  // Password protection states
  const [folderPasswords, setFolderPasswords] = useState<Record<string, string>>({})
  const [passwordRequired, setPasswordRequired] = useState(false)
  const [folderPasswordInput, setFolderPasswordInput] = useState('')
  const [folderPasswordError, setFolderPasswordError] = useState<string | null>(null)

  // Load saved folder passwords from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem('cxr_folder_passwords')
    if (stored) {
      try {
        setFolderPasswords(JSON.parse(stored))
      } catch (e) {
        console.error('Failed to parse folder passwords', e)
      }
    }
  }, [])

  const handleUnlockFolder = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!folderPasswordInput.trim()) return

    setIsLoading(true)
    setFolderPasswordError(null)

    try {
      const nextPasswords = {
        ...folderPasswords,
        [currentPath]: folderPasswordInput,
      }

      const headers: Record<string, string> = {
        'x-folder-password': encodeURIComponent(JSON.stringify(nextPasswords))
      }

      const testRes = await fetch(`/api/folders?parentId=${encodeURIComponent(currentPath)}`, { headers })

      if (testRes.ok) {
        setFolderPasswords(nextPasswords)
        localStorage.setItem('cxr_folder_passwords', JSON.stringify(nextPasswords))
        setPasswordRequired(false)
        setFolderPasswordInput('')
      } else {
        const errData = await testRes.json().catch(() => ({}))
        setFolderPasswordError(errData.error === 'password_invalid' ? 'Incorrect password. Please try again.' : 'Access denied.')
      }
    } catch {
      setFolderPasswordError('An error occurred. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const { toast } = useToast()

  const {
    filters,
    setSearch,
    setTypes,
    setVisibility,
    setSortBy,
    setPage,
  } = useFileFilters()

  const navigateToFolder = useCallback(
    (folderId: string, folderName: string) => {
      setCurrentPath(folderId)
      setFolderPath((prev) => [...prev, { id: folderId, name: folderName }])
      setPage(1)
    },
    [setPage]
  )

  const navigateToBreadcrumb = useCallback(
    (index: number) => {
      if (index === -1) {
        setCurrentPath('/')
        setFolderPath([])
      } else {
        setCurrentPath(folderPath[index].id)
        setFolderPath(folderPath.slice(0, index + 1))
      }
      setPage(1)
    },
    [folderPath, setPage]
  )

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return
    try {
      const res = await fetch('/api/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newFolderName.trim(),
          parentId: currentPath === '/' ? null : currentPath,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to create folder')
      }
      const created = await res.json()
      setFolders((prev) => [...prev, { id: created.data.id, name: created.data.name, fileCount: 0 }])
      setNewFolderName('')
      setIsCreateFolderOpen(false)
      toast({ title: 'Folder created', description: `"${created.data.name}" created` })
    } catch (e) {
      toast({
        title: 'Failed to create folder',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      })
    }
  }

  const handleDeleteFolder = useCallback((folderId: string) => {
    setFolders((prev) => prev.filter((f) => f.id !== folderId))
  }, [])

  const handleRenameFolder = useCallback(
    (folderId: string, newName: string) => {
      setFolders((prev) =>
        prev.map((f) => (f.id === folderId ? { ...f, name: newName } : f))
      )
    },
    []
  )

  useEffect(() => {
    if (currentPath === '' || currentPath === '/') {
      setChatInfo(null)
      return
    }
    const checkChatAuth = async () => {
      try {
        const res = await fetch(`/api/folders/chat-info?path=${encodeURIComponent(currentPath)}`)
        if (res.ok) {
          const data = await res.json()
          setChatInfo(data.data)
        } else {
          setChatInfo(null)
        }
      } catch (err) {
        console.error('Failed to check chat auth', err)
        setChatInfo(null)
      }
    }
    checkChatAuth()
  }, [currentPath])

  useEffect(() => {
    async function fetchData() {
      try {
        setIsLoading(true)
        setPasswordRequired(false)
        setFolderPasswordError(null)
        setIsAccessDenied(false)

        const headers: Record<string, string> = {}
        if (Object.keys(folderPasswords).length > 0) {
          headers['x-folder-password'] = encodeURIComponent(JSON.stringify(folderPasswords))
        }

        const folderRes = await fetch(`/api/folders?parentId=${encodeURIComponent(currentPath)}`, { headers })

        if (folderRes.status === 401) {
          setPasswordRequired(true)
          setFolders([])
          setFiles([])
          return
        }

        if (folderRes.status === 403 || folderRes.status === 404) {
          const errData = folderRes.ok ? {} : await folderRes.json().catch(() => ({}))
          if (errData.error === 'team_only' || errData.error === 'private') {
            setIsAccessDenied(true)
            setFolders([])
            setFiles([])
            setIsLoading(false)
            return
          }
        }

        const folderData = folderRes.ok ? await folderRes.json() : null
        setFolders(Array.isArray(folderData?.data) ? folderData.data : [])

        const fileParams = new URLSearchParams({
          page: filters.page.toString(),
          limit: filters.limit.toString(),
          search: filters.search,
          sortBy: filters.sortBy,
          path: currentPath,
          ...(filters.types.length > 0 && { types: filters.types.join(',') }),
        })

        const fileRes = await fetch(`/api/files?${fileParams}`, { headers })

        if (fileRes.status === 401) {
          setPasswordRequired(true)
          setFolders([])
          setFiles([])
          return
        }

        if (!fileRes.ok) throw new Error('Failed to fetch files')
        const apiResult = await fileRes.json()

        setFiles(Array.isArray(apiResult.data) ? apiResult.data : [])
        if (apiResult.pagination) {
          setPaginationInfo({
            total: apiResult.pagination.total || 0,
            pageCount: apiResult.pagination.pageCount || 0,
            page: filters.page,
            limit: filters.limit,
          })
        }
      } catch (error) {
        console.error('Error fetching data:', error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()
  }, [filters, currentPath, folderPasswords])

  const handleDelete = (fileId: string) => {
    setFiles((files) => files.filter((file) => file.id !== fileId))
    setPaginationInfo((prev) => ({
      ...prev,
      total: prev.total - 1,
      pageCount: Math.ceil((prev.total - 1) / prev.limit),
    }))
  }

  const renderContent = () => {
    if (isAccessDenied) {
      return (
        <div className="flex flex-col items-center justify-center py-12 px-4 animate-in fade-in duration-500">
          <Card className="w-full max-w-md p-8 border border-red-500/20 bg-card/60 backdrop-blur-xl shadow-2xl relative overflow-hidden rounded-2xl text-center">
            <div className="absolute -top-10 -right-10 w-24 h-24 bg-red-500/10 rounded-full blur-2xl animate-pulse" />
            <div className="absolute -bottom-10 -left-10 w-24 h-24 bg-red-500/10 rounded-full blur-2xl animate-pulse" />

            <div className="flex flex-col items-center space-y-4">
              <div className="p-4 rounded-full bg-red-500/10 border border-red-500/20 text-red-500 animate-pulse">
                <Lock className="h-8 w-8" />
              </div>
              <div className="space-y-1">
                <h3 className="text-xl font-bold tracking-tight text-red-100">Restricted Folder</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  You are not a member of the team assigned to this folder and do not have permission to view its contents.
                </p>
              </div>

              <Button
                onClick={() => navigateToBreadcrumb(-1)}
                className="w-full mt-4 border border-border bg-background/50 hover:bg-white/10 text-foreground transition-all duration-300"
              >
                Go Back
              </Button>
            </div>
          </Card>
        </div>
      )
    }

    if (passwordRequired) {
      return (
        <div className="flex flex-col items-center justify-center py-12 px-4 animate-in fade-in duration-500">
          <Card className="w-full max-w-md p-8 border border-primary/20 bg-card/60 backdrop-blur-xl shadow-2xl relative overflow-hidden rounded-2xl">
            <div className="absolute -top-10 -right-10 w-24 h-24 bg-primary/20 rounded-full blur-2xl animate-pulse" />
            <div className="absolute -bottom-10 -left-10 w-24 h-24 bg-primary/20 rounded-full blur-2xl animate-pulse" />

            <div className="flex flex-col items-center text-center space-y-4">
              <div className="p-4 rounded-full bg-primary/10 border border-primary/20 text-primary animate-bounce">
                <Lock className="h-8 w-8" />
              </div>
              <div className="space-y-1">
                <h3 className="text-xl font-bold tracking-tight text-foreground">Password Protected</h3>
                <p className="text-sm text-muted-foreground">
                  This folder requires a password to open and access its contents.
                </p>
              </div>

              <form onSubmit={handleUnlockFolder} className="w-full space-y-4 pt-4">
                <div className="space-y-2 text-left">
                  <Label htmlFor="folder-password" className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">
                    Enter Password
                  </Label>
                  <Input
                    id="folder-password"
                    type="password"
                    placeholder="••••••••"
                    value={folderPasswordInput}
                    onChange={(e) => setFolderPasswordInput(e.target.value)}
                    className="w-full bg-background/50 border-border focus:border-primary text-center tracking-widest text-lg"
                    autoFocus
                  />
                  {folderPasswordError && (
                    <p className="text-xs text-destructive mt-1 font-medium">{folderPasswordError}</p>
                  )}
                </div>

                <Button type="submit" className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold shadow-lg shadow-primary/20 transition-all duration-300">
                  Unlock Directory
                </Button>
              </form>
            </div>
          </Card>
        </div>
      )
    }

    if (isLoading) {
      return (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }, (_, i) => (
              <FileCardSkeleton key={`skeleton-${i}`} />
            ))}
          </div>
          <PaginationSkeleton />
        </>
      )
    }

    if (folders.length === 0 && files.length === 0) {
      const hasActiveFilters = filters.search || filters.types.length > 0

      return (
        <EmptyPlaceholder>
          <EmptyPlaceholder.Icon name="file" />
          {hasActiveFilters ? (
            <>
              <EmptyPlaceholder.Title>No files found</EmptyPlaceholder.Title>
              <EmptyPlaceholder.Description>
                Try adjusting your filters to find files.
              </EmptyPlaceholder.Description>
            </>
          ) : (
            <>
              <EmptyPlaceholder.Title>
                {currentPath !== '/' ? 'This folder is empty' : 'No files'}
              </EmptyPlaceholder.Title>
              <EmptyPlaceholder.Description>
                {currentPath !== '/'
                  ? 'Upload files here or create a new folder.'
                  : 'Upload your first file or create a folder to get started.'}
              </EmptyPlaceholder.Description>
            </>
          )}
        </EmptyPlaceholder>
      )
    }

    return (
      <>
        {folders.length > 0 && (
          <>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Folders
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 mb-8">
              {folders.map((folder) => (
                <FolderCard
                  key={folder.id}
                  folder={{
                    id: folder.id,
                    name: folder.name,
                    userId: folder.userId || '',
                    parentId: currentPath === '/' ? null : currentPath,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    fileCount: folder.fileCount,
                    size: folder.size,
                    visibility: folder.visibility,
                    isMember: folder.isMember,
                    teamLeaderId: folder.teamLeaderId,
                  }}
                  onNavigate={navigateToFolder}
                  onDelete={handleDeleteFolder}
                  onRename={handleRenameFolder}
                />
              ))}
            </div>
          </>
        )}
        {files.length > 0 && (
          <>
            {folders.length > 0 && (
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mt-2">
                Files
              </h2>
            )}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {files.map((file) => (
                <FileCard key={file.id} file={file} onDelete={handleDelete} />
              ))}
            </div>
          </>
        )}
        <FileGridPagination paginationInfo={paginationInfo} setPage={setPage} />
      </>
    )
  }

  return (
    <div className="space-y-6">
      <div className="relative rounded-2xl bg-white/10 dark:bg-black/10 backdrop-blur-xl border border-white/20 dark:border-white/10 shadow-lg shadow-black/5 dark:shadow-black/20">
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/10 via-transparent to-black/5 dark:from-white/5 dark:via-transparent dark:to-black/10" />
        <div className="relative">
          <div className="p-6 pb-4 flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">Your Files</h1>
              <p className="text-muted-foreground mt-1">
                Browse files on your SFTP server
              </p>
            </div>
            <div className="flex items-center gap-2">
              {chatInfo?.isAllowed && !isAccessDenied && !passwordRequired && (
                <Button
                  variant="outline"
                  size="sm"
                  className="border-purple-500/30 hover:bg-purple-500/10 text-purple-400 hover:text-purple-300 shadow-md shadow-purple-500/5 transition-all duration-300"
                  onClick={() => setIsChatOpen(true)}
                >
                  <MessageSquare className="mr-2 h-4 w-4" />
                  Team Chat
                </Button>
              )}
              {!isAccessDenied && !passwordRequired && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsCreateFolderOpen(true)}
                  >
                    <FolderPlus className="mr-2 h-4 w-4" />
                    New Folder
                  </Button>
                  <Button variant="default" size="sm" asChild>
                    <Link href={`/dashboard/upload?path=${encodeURIComponent(currentPath)}`}>
                      <Upload className="mr-2 h-4 w-4" />
                      Upload
                    </Link>
                  </Button>
                </>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9"
                onClick={() => window.location.reload()}
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {folderPath.length > 0 && (
            <div className="px-6 pb-2">
              <nav className="flex items-center gap-1 text-sm text-muted-foreground">
                <button
                  onClick={() => navigateToBreadcrumb(-1)}
                  className="hover:text-foreground transition-colors flex items-center gap-1"
                >
                  <Home className="h-3.5 w-3.5" />
                  Home
                </button>
                {folderPath.map((folder, i) => (
                  <span key={folder.id} className="flex items-center gap-1">
                    <ChevronRight className="h-3.5 w-3.5" />
                    {i === folderPath.length - 1 ? (
                      <span className="text-foreground font-medium">
                        {folder.name}
                      </span>
                    ) : (
                      <button
                        onClick={() => navigateToBreadcrumb(i)}
                        className="hover:text-foreground transition-colors"
                      >
                        {folder.name}
                      </button>
                    )}
                  </span>
                ))}
              </nav>
            </div>
          )}

          <div className="px-6 pb-6">
            <div className="flex flex-col sm:flex-row gap-4">
              <SearchInput onSearch={setSearch} initialValue={filters.search} />
              <FileFilters
                sortBy={filters.sortBy as SortOption}
                onSortChange={setSortBy}
                selectedTypes={filters.types}
                onTypesChange={setTypes}
                fileTypes={fileTypes}
                date={undefined}
                onDateChange={() => {}}
                visibility={filters.visibility}
                onVisibilityChange={setVisibility}
              />
            </div>
          </div>
        </div>
      </div>
      {renderContent()}

      <Dialog open={isCreateFolderOpen} onOpenChange={setIsCreateFolderOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Folder</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="folder-name">Folder name</Label>
              <Input
                id="folder-name"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
                placeholder="Enter folder name"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setIsCreateFolderOpen(false)
                  setNewFolderName('')
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreateFolder}
                disabled={!newFolderName.trim()}
              >
                Create
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {chatInfo?.isAllowed && chatInfo.chatFolderId && chatInfo.chatFolderName && (
        <TeamChatSheet
          isOpen={isChatOpen}
          onOpenChange={setIsChatOpen}
          chatFolderId={chatInfo.chatFolderId}
          chatFolderName={chatInfo.chatFolderName}
          ownerId={chatInfo.ownerId || ''}
        />
      )}
    </div>
  )
}
