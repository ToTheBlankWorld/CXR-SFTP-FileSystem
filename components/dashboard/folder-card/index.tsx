'use client'

import { useState } from 'react'

import { FolderType } from '@/types/dto/folder'
import { Download, Edit3, Folder, FolderOpen, Trash2 } from 'lucide-react'

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

export function FolderCard({
  folder,
  onNavigate,
  onDelete,
  onRename,
}: FolderCardProps) {
  const { toast } = useToast()
  const [isRenameOpen, setIsRenameOpen] = useState(false)
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [newName, setNewName] = useState(folder.name)

  const handleRename = async () => {
    if (!newName.trim() || newName.trim() === folder.name) {
      setIsRenameOpen(false)
      return
    }
    try {
      const res = await fetch(`/api/folders/${encodeURIComponent(folder.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() }),
      })
      if (!res.ok) {
        if (res.status === 403) {
          throw new Error("You don't have permission to modify or delete this file/folder")
        }
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to rename folder')
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
      const res = await fetch(`/api/folders/${encodeURIComponent(folder.id)}`, { method: 'DELETE' })
      if (!res.ok) {
        if (res.status === 403) {
          throw new Error("You don't have permission to modify or delete this file/folder")
        }
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to delete folder')
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

  return (
    <>
      <Card
        className="group relative overflow-hidden bg-background/40 backdrop-blur-xl border-border/50 shadow-lg shadow-black/5 hover:shadow-xl hover:shadow-black/10 transition-all duration-300 hover:bg-background/60 cursor-pointer"
        onClick={() => onNavigate(folder.id, folder.name)}
      >
        <div className="relative aspect-square bg-gradient-to-br from-blue-950/40 via-black/20 to-blue-900/20 flex items-center justify-center overflow-hidden transition-all duration-500 group-hover:from-blue-950/60 group-hover:to-blue-900/40">
          {/* Glowing neon background blur */}
          <div className="absolute w-24 h-24 rounded-full bg-blue-500/15 blur-xl opacity-0 group-hover:opacity-100 transition-all duration-500" />
          
          {/* Animated glow shadow under the icon */}
          <Folder className="h-20 w-20 text-blue-500/40 absolute blur-md opacity-0 group-hover:opacity-100 group-hover:scale-110 transition-all duration-500" />
          
          {/* Closed Folder (Default state) */}
          <Folder className="h-20 w-20 text-blue-500/60 transition-all duration-500 ease-out group-hover:scale-110 group-hover:opacity-0" />
          
          {/* Open Folder (Hovered state) */}
          <FolderOpen className="h-20 w-20 text-blue-400/80 absolute opacity-0 scale-95 transition-all duration-500 ease-out group-hover:opacity-100 group-hover:scale-110" />
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
                      const a = document.createElement('a')
                      a.href = `/api/folders/${encodeURIComponent(folder.id)}/download`
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
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="secondary"
                    size="icon"
                    className="h-8 w-8 glass-hover"
                    onClick={(e) => {
                      e.stopPropagation()
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
    </>
  )
}
