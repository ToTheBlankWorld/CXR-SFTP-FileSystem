'use client'

import { useEffect, useState } from 'react'

import { FolderType, FolderMemberInfo } from '@/types/dto/folder'
import {
  Crown,
  Download,
  Edit3,
  Folder,
  FolderOpen,
  ShieldAlert,
  Shield,
  Trash2,
  UserPlus,
  UserX,
  Users,
} from 'lucide-react'
import { useSession } from 'next-auth/react'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

import { useToast } from '@/hooks/use-toast'
import { formatBytes } from '@/lib/utils'

interface FolderCardProps {
  folder: FolderType
  onNavigate: (folderId: string, folderName: string) => void
  onDelete?: (folderId: string) => void
  onRename?: (folderId: string, newName: string) => void
}

interface SelectableUser {
  id: string
  name: string | null
  email: string | null
  role: string
  image: string | null
}

export function FolderCard({
  folder,
  onNavigate,
  onDelete,
  onRename,
}: FolderCardProps) {
  const { toast } = useToast()
  const { data: session } = useSession()
  const currentUserRole = session?.user?.role
  const currentUserId = session?.user?.id
  const isOwnerRole = currentUserRole === 'OWNER'

  const [isRenameOpen, setIsRenameOpen] = useState(false)
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [newName, setNewName] = useState(folder.name)
  const [isPermissionDeniedOpen, setIsPermissionDeniedOpen] = useState(false)
  const [permissionErrorMsg, setPermissionErrorMsg] = useState('')
  const [isTeamAccessDeniedOpen, setIsTeamAccessDeniedOpen] = useState(false)

  const [isTeamOpen, setIsTeamOpen] = useState(false)
  const [members, setMembers] = useState<FolderMemberInfo[]>([])
  const [isLoadingMembers, setIsLoadingMembers] = useState(false)
  const [availableUsers, setAvailableUsers] = useState<SelectableUser[]>([])
  const [selectedUserId, setSelectedUserId] = useState<string>('')
  const [teamLeaderId, setTeamLeaderId] = useState<string | null>(null)
  const [ownerInfo, setOwnerInfo] = useState<SelectableUser | null>(null)

  const isTeamFolder = folder.visibility === 'TEAM'
  const canEnterFolder =
    !isTeamFolder ||
    folder.isMember ||
    isOwnerRole ||
    currentUserId === folder.userId

  const folderPathSegment = folder.id
    .split('/')
    .filter(Boolean)
    .map(encodeURIComponent)
    .join('/')

  const handleCardClick = () => {
    if (!canEnterFolder) {
      setIsTeamAccessDeniedOpen(true)
      return
    }
    onNavigate(folder.id, folder.name)
  }

  const fetchMembers = async () => {
    setIsLoadingMembers(true)
    try {
      const res = await fetch(`/api/folder-members/${folderPathSegment}`)
      if (!res.ok) throw new Error('Failed to load members')
      const data = await res.json()
      setMembers(data.data?.members || [])
      setTeamLeaderId(data.data?.teamLeaderId || null)
      setOwnerInfo(data.data?.owner || null)
    } catch (err) {
      toast({
        title: 'Failed to load members',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      })
    } finally {
      setIsLoadingMembers(false)
    }
  }

  const fetchAvailableUsers = async () => {
    try {
      const res = await fetch('/api/users?page=1&limit=100')
      if (!res.ok) return
      const data = await res.json()
      setAvailableUsers(data.data || [])
    } catch (err) {
      console.error('Failed to load users', err)
    }
  }

  useEffect(() => {
    if (isTeamOpen) {
      fetchMembers()
      fetchAvailableUsers()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTeamOpen])

  const handleAddMember = async () => {
    if (!selectedUserId) return
    try {
      const res = await fetch(`/api/folder-members/${folderPathSegment}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: selectedUserId }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to add member')
      }
      setSelectedUserId('')
      await fetchMembers()
      toast({ title: 'Member added' })
    } catch (err) {
      toast({
        title: 'Failed to add member',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      })
    }
  }

  const handleRemoveMember = async (userId: string) => {
    try {
      const res = await fetch(
        `/api/folder-members/${folderPathSegment}?userId=${encodeURIComponent(userId)}`,
        { method: 'DELETE' }
      )
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to remove member')
      }
      await fetchMembers()
      toast({ title: 'Member removed' })
    } catch (err) {
      toast({
        title: 'Failed to remove member',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      })
    }
  }

  const handleSetTeamLeader = async (leaderId: string) => {
    try {
      const targetLeaderId = leaderId === 'none' ? null : leaderId
      const res = await fetch(`/api/folder-members/${folderPathSegment}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamLeaderId: targetLeaderId }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to update team leader')
      }
      setTeamLeaderId(targetLeaderId)
      toast({ title: 'Team leader updated' })
    } catch (err) {
      toast({
        title: 'Failed to update team leader',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      })
    }
  }

  const handleRename = async () => {
    if (!newName.trim() || newName.trim() === folder.name) {
      setIsRenameOpen(false)
      return
    }
    try {
      const res = await fetch(`/api/folders/${folderPathSegment}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        const errorMsg = data.error || ''
        if (
          res.status === 403 ||
          errorMsg.toLowerCase().includes('permission') ||
          errorMsg.toLowerCase().includes('only') ||
          errorMsg.toLowerCase().includes('modify')
        ) {
          setPermissionErrorMsg(errorMsg || "You don't have permission to modify or delete this file/folder")
          setIsPermissionDeniedOpen(true)
          setIsRenameOpen(false)
          return
        }
        throw new Error(errorMsg || 'Failed to rename folder')
      }
      toast({
        title: 'Folder renamed',
        description: `Folder renamed to "${newName.trim()}"`,
      })
      onRename?.(folder.id, newName.trim())
      setIsRenameOpen(false)
    } catch (err) {
      toast({
        title: 'Failed to rename folder',
        description: err instanceof Error ? err.message : 'An error occurred',
        variant: 'destructive',
      })
    }
  }

  const handleDelete = async () => {
    try {
      const res = await fetch(`/api/folders/${folderPathSegment}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        const errorMsg = data.error || ''
        if (
          res.status === 403 ||
          errorMsg.toLowerCase().includes('permission') ||
          errorMsg.toLowerCase().includes('only') ||
          errorMsg.toLowerCase().includes('modify')
        ) {
          setPermissionErrorMsg(errorMsg || "You don't have permission to modify or delete this file/folder")
          setIsPermissionDeniedOpen(true)
          setIsDeleteOpen(false)
          return
        }
        throw new Error(errorMsg || 'Failed to delete folder')
      }
      toast({
        title: 'Folder deleted',
        description: `${folder.name} has been deleted`,
      })
      onDelete?.(folder.id)
      setIsDeleteOpen(false)
    } catch (err) {
      toast({
        title: 'Failed to delete folder',
        description: err instanceof Error ? err.message : 'An error occurred',
        variant: 'destructive',
      })
    }
  }

  const memberIds = new Set(members.map((m) => m.id))
  const usersToShow = availableUsers.filter((u) => !memberIds.has(u.id) && u.id !== folder.userId)

  return (
    <>
      <Card
        className="group relative overflow-hidden bg-background/40 backdrop-blur-xl border-border/50 shadow-lg shadow-black/5 hover:shadow-xl hover:shadow-black/10 transition-all duration-300 hover:bg-background/60 cursor-pointer"
        onClick={handleCardClick}
      >
        <div className="relative aspect-square bg-gradient-to-br from-blue-950/40 via-black/20 to-blue-900/20 flex items-center justify-center overflow-hidden transition-all duration-500 group-hover:from-blue-950/60 group-hover:to-blue-900/40">
          <div className="absolute w-24 h-24 rounded-full bg-blue-500/15 blur-xl opacity-0 group-hover:opacity-100 transition-all duration-500" />
          <Folder className="h-20 w-20 text-blue-500/40 absolute blur-md opacity-0 group-hover:opacity-100 group-hover:scale-110 transition-all duration-500" />
          <Folder className="h-20 w-20 text-blue-500/60 transition-all duration-500 ease-out group-hover:scale-110 group-hover:opacity-0" />
          <FolderOpen className="h-20 w-20 text-blue-400/80 absolute opacity-0 scale-95 transition-all duration-500 ease-out group-hover:opacity-100 group-hover:scale-110" />

          {isTeamFolder && (
            <div className="absolute top-2 right-2 flex gap-1.5">
              <div className="rounded-full bg-purple-500/20 ring-1 ring-purple-500/40 px-2 py-1 flex items-center gap-1 backdrop-blur-md">
                <Shield className="h-3 w-3 text-purple-300" />
                <span className="text-[10px] font-semibold text-purple-200 uppercase tracking-wider">Team</span>
              </div>
              {folder.teamLeaderId && (
                <div className="rounded-full bg-yellow-500/20 ring-1 ring-yellow-500/40 px-2 py-1 flex items-center gap-1 backdrop-blur-md">
                  <Crown className="h-3 w-3 text-yellow-300" />
                  <span className="text-[10px] font-semibold text-yellow-200 uppercase tracking-wider">Leader</span>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-3">
          <div className="flex gap-1">
            <TooltipProvider delayDuration={150}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="secondary"
                    size="icon"
                    className="h-8 w-8 glass-hover"
                    onClick={(e) => {
                      e.stopPropagation()
                      if (!canEnterFolder) {
                        setIsTeamAccessDeniedOpen(true)
                        return
                      }
                      const a = document.createElement('a')
                      a.href = `/api/folders/download/${folderPathSegment}`
                      a.download = `${folder.name}.tar`
                      document.body.appendChild(a)
                      a.click()
                      document.body.removeChild(a)
                    }}
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Download</TooltipContent>
              </Tooltip>
 
              {(isOwnerRole || currentUserId === folder.userId) && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="secondary"
                      size="icon"
                      className="h-8 w-8 glass-hover"
                      onClick={(e) => {
                        e.stopPropagation()
                        setIsTeamOpen(true)
                      }}
                    >
                      <Users className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Manage Team</TooltipContent>
                </Tooltip>
              )}
 
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="secondary"
                    size="icon"
                    className="h-8 w-8 glass-hover"
                    onClick={(e) => {
                      e.stopPropagation()
                      if (!canEnterFolder) {
                        setIsTeamAccessDeniedOpen(true)
                        return
                      }
                      setNewName(folder.name)
                      setIsRenameOpen(true)
                    }}
                  >
                    <Edit3 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Rename</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="secondary"
                    size="icon"
                    className="h-8 w-8 glass-hover"
                    onClick={(e) => {
                      e.stopPropagation()
                      if (!canEnterFolder) {
                        setIsTeamAccessDeniedOpen(true)
                        return
                      }
                      setIsDeleteOpen(true)
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Delete</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>

        <div className="p-3">
          <div className="flex items-center justify-between gap-2">
            <TooltipProvider delayDuration={150}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="font-medium truncate block text-sm">
                    {folder.name}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" align="start">
                  {folder.name}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            {folder.size !== undefined && (
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {formatBytes(folder.size)}
              </span>
            )}
          </div>
        </div>
      </Card>

      <Dialog open={isRenameOpen} onOpenChange={setIsRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Folder</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="rename-input">Folder name</Label>
              <Input
                id="rename-input"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleRename()}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsRenameOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleRename}>Rename</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Folder</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p>
              Are you sure you want to delete <strong>{folder.name}</strong>?
              This will permanently delete all files and subfolders inside it.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsDeleteOpen(false)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleDelete}>
                Delete
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isTeamOpen} onOpenChange={setIsTeamOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Manage Team — {folder.name}
            </DialogTitle>
            <DialogDescription>
              Only members listed below (plus the folder creator and OWNERs) can
              access this folder. Adding the first member converts the folder
              into a team folder; removing all members reverts it to public.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Add a member</Label>
              <div className="flex gap-2">
                <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Select a user or admin" />
                  </SelectTrigger>
                  <SelectContent>
                    {usersToShow.length === 0 ? (
                      <div className="px-2 py-1.5 text-sm text-muted-foreground">
                        No users available to add
                      </div>
                    ) : (
                      usersToShow.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          <div className="flex items-center gap-2">
                            {u.role === 'OWNER' ? (
                              <Crown className="h-3.5 w-3.5 text-yellow-500" />
                            ) : (
                              <Shield
                                className={`h-3.5 w-3.5 ${u.role === 'ADMIN' ? 'text-primary' : 'text-muted-foreground'}`}
                              />
                            )}
                            <span>{u.name || u.email}</span>
                            <span className="text-xs text-muted-foreground">
                              ({u.role})
                            </span>
                          </div>
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                <Button onClick={handleAddMember} disabled={!selectedUserId}>
                  <UserPlus className="h-4 w-4 mr-2" />
                  Add
                </Button>
              </div>
            </div>

            {members.length > 0 && (
              <div className="space-y-2 border-t pt-4">
                <Label htmlFor="team-leader-select" className="flex items-center gap-1.5 font-medium">
                  <Crown className="h-4 w-4 text-yellow-500" />
                  Team Leader
                </Label>
                <div className="flex gap-2">
                  <Select
                    value={teamLeaderId || 'none'}
                    onValueChange={handleSetTeamLeader}
                  >
                    <SelectTrigger className="w-full bg-background/50 border-border/50" id="team-leader-select">
                      <SelectValue placeholder="Select team leader" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No Team Leader (Default permissions)</SelectItem>
                      {ownerInfo && (
                        <SelectItem value={ownerInfo.id}>
                          <div className="flex items-center gap-2">
                            <Crown className="h-3.5 w-3.5 text-yellow-500" />
                            <span>{ownerInfo.name || ownerInfo.email} (Owner)</span>
                          </div>
                        </SelectItem>
                      )}
                      {members
                        .filter((m) => m.id !== ownerInfo?.id)
                        .map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            <div className="flex items-center gap-2">
                              <Shield className="h-3.5 w-3.5 text-muted-foreground" />
                              <span>{m.name || m.email} (Member)</span>
                            </div>
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  If selected, only the team leader (plus system OWNERs/ADMINs) can rename or delete this folder.
                </p>
              </div>
            )}

            <div className="space-y-2 border-t pt-4">
              <Label>Current members ({members.length})</Label>
              {isLoadingMembers ? (
                <p className="text-sm text-muted-foreground">Loading...</p>
              ) : members.length === 0 ? (
                <p className="text-sm text-muted-foreground py-3 text-center border rounded-md bg-muted/30">
                  No members yet. This folder is currently public.
                </p>
              ) : (
                <div className="space-y-2 max-h-[280px] overflow-y-auto">
                  {teamLeaderId === ownerInfo?.id && ownerInfo && (
                    <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-md border border-yellow-500/20 bg-yellow-500/5">
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={ownerInfo.image || undefined} />
                          <AvatarFallback>
                            {(ownerInfo.name || ownerInfo.email || '?')
                              .split(' ')
                              .map((n) => n[0])
                              .join('')
                              .slice(0, 2)
                              .toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate flex items-center gap-1.5">
                            <Crown className="h-3.5 w-3.5 text-yellow-500 flex-shrink-0" />
                            <span>{ownerInfo.name || ownerInfo.email}</span>
                            <span className="px-1.5 py-0.5 rounded bg-yellow-500/10 text-[9px] font-bold text-yellow-500 border border-yellow-500/20 uppercase tracking-wider">
                              Leader
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            {ownerInfo.email} (Owner)
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  {members.map((m) => (
                    <div
                      key={m.id}
                      className="flex items-center justify-between gap-3 px-3 py-2 rounded-md border bg-card/40"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={m.image || undefined} />
                          <AvatarFallback>
                            {(m.name || m.email || '?')
                              .split(' ')
                              .map((n) => n[0])
                              .join('')
                              .slice(0, 2)
                              .toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate flex items-center gap-1.5">
                            {m.role === 'OWNER' ? (
                              <Crown className="h-3.5 w-3.5 text-yellow-500 flex-shrink-0" />
                            ) : (
                              <Shield
                                className={`h-3.5 w-3.5 flex-shrink-0 ${m.role === 'ADMIN' ? 'text-primary' : 'text-muted-foreground'}`}
                              />
                            )}
                            <span>{m.name || m.email}</span>
                            {m.id === teamLeaderId && (
                              <span className="px-1.5 py-0.5 rounded bg-yellow-500/10 text-[9px] font-bold text-yellow-500 border border-yellow-500/20 uppercase tracking-wider">
                                Leader
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            {m.email}
                          </div>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemoveMember(m.id)}
                        className="text-destructive hover:text-destructive flex-shrink-0"
                      >
                        <UserX className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isPermissionDeniedOpen} onOpenChange={setIsPermissionDeniedOpen}>
        <DialogContent className="sm:max-w-md border border-red-500/20 bg-black/90 backdrop-blur-xl shadow-[0_0_50px_rgba(239,68,68,0.15)] text-foreground">
          <DialogHeader className="flex flex-col items-center gap-4 text-center">
            <div className="rounded-full bg-red-500/10 p-3 ring-1 ring-red-500/30">
              <ShieldAlert className="h-6 w-6 text-red-500 animate-pulse" />
            </div>
            <DialogTitle className="text-xl font-bold tracking-tight">Permission Denied</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4 text-center">
            <p className="text-sm text-muted-foreground leading-relaxed">
              {permissionErrorMsg || "You don't have permission to modify or delete this file/folder"}
            </p>
            <div className="flex justify-center pt-2">
              <Button
                variant="outline"
                className="w-28 border-border/50 hover:bg-white/10"
                onClick={() => setIsPermissionDeniedOpen(false)}
              >
                Dismiss
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isTeamAccessDeniedOpen} onOpenChange={setIsTeamAccessDeniedOpen}>
        <DialogContent className="sm:max-w-md border border-red-500/30 bg-black/95 backdrop-blur-xl shadow-[0_0_60px_rgba(239,68,68,0.25)] text-foreground">
          <DialogHeader className="flex flex-col items-center gap-4 text-center">
            <div className="rounded-full bg-red-500/10 p-3 ring-2 ring-red-500/40">
              <ShieldAlert className="h-7 w-7 text-red-500 animate-pulse" />
            </div>
            <DialogTitle className="text-xl font-bold tracking-tight text-red-100">
              Restricted Team Folder
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4 text-center">
            <p className="text-sm text-red-200/80 leading-relaxed font-medium">
              You are not part of this team and not allowed to access this folder.
            </p>
            <p className="text-xs text-muted-foreground">
              If you believe you should have access, contact the owner of this
              instance to be added to the <strong>{folder.name}</strong> team.
            </p>
            <div className="flex justify-center pt-2">
              <Button
                variant="outline"
                className="w-28 border-red-500/30 hover:bg-red-500/10 text-red-100"
                onClick={() => setIsTeamAccessDeniedOpen(false)}
              >
                Dismiss
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
