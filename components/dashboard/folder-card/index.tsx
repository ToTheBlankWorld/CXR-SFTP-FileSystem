'use client'

import { useState } from 'react'

import { FolderType } from '@/types/dto/folder'
import { Download, Edit3, Folder, Trash2 } from 'lucide-react'

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
      if (!res.ok) throw new Error()
      toast({
        title: 'Folder renamed',
        description: `Folder renamed to "${newName.trim()}"`,
      })
      onRename?.(folder.id, newName.trim())
      setIsRenameOpen(false)
    } catch {
      toast({ title: 'Failed to rename folder', variant: 'destructive' })
    }
  }

  const handleDelete = async () => {
    try {
      const res = await fetch(`/api/folders/${encodeURIComponent(folder.id)}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      toast({
        title: 'Folder deleted',
        description: `${folder.name} has been deleted`,
      })
      onDelete?.(folder.id)
      setIsDeleteOpen(false)
    } catch {
      toast({ title: 'Failed to delete folder', variant: 'destructive' })
    }
  }

  return (
    <>
      <Card
        className="group relative overflow-hidden bg-background/40 backdrop-blur-xl border-border/50 shadow-lg shadow-black/5 hover:shadow-xl hover:shadow-black/10 transition-all duration-300 hover:bg-background/60 cursor-pointer"
        onClick={() => onNavigate(folder.id, folder.name)}
      >
        <div className="relative aspect-square bg-gradient-to-br from-blue-500/10 to-purple-500/10 flex items-center justify-center">
          <Folder className="h-20 w-20 text-blue-500/60" />
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
