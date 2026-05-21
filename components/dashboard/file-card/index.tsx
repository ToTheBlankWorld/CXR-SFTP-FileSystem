'use client'

import { useState } from 'react'

import Link from 'next/link'

import { FileType } from '@/types/components/file'

import {
  Clock,
  Download,
  Link as LinkIcon,
  Trash2,
} from 'lucide-react'

import { getFileIcon } from '@/components/dashboard/file-card/utils'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

import { formatBytes, getRelativeTime } from '@/lib/utils'

import { useToast } from '@/hooks/use-toast'

interface FileCardProps {
  file: FileType
  onDelete?: (id: string) => void
}

export function FileCard({ file: initialFile, onDelete }: FileCardProps) {
  const { toast } = useToast()
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [file] = useState(initialFile)
  const [isDeleted, setIsDeleted] = useState(false)

  const handleCopyLink = () => {
    navigator.clipboard.writeText(file.urlPath)
    toast({
      title: 'Link copied',
      description: 'File link has been copied to clipboard',
    })
  }

  const handleDelete = async () => {
    try {
      const response = await fetch(`/api/files?path=${encodeURIComponent(file.id)}`, {
        method: 'DELETE',
      })
      if (!response.ok) {
        if (response.status === 403) {
          throw new Error("You don't have permission to modify or delete this file/folder")
        }
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to delete file')
      }

      setIsDeleted(true)

      if (onDelete) {
        onDelete(file.id)
      }

      toast({
        title: 'File deleted',
        description: 'The file has been permanently deleted',
      })
    } catch (err) {
      toast({
        title: 'Failed to delete file',
        description: err instanceof Error ? err.message : 'Please try again',
        variant: 'destructive',
      })
    }
  }

  if (isDeleted) {
    return null
  }

  return (
    <Card className="group relative overflow-hidden bg-background/40 backdrop-blur-xl border-border/50 shadow-lg shadow-black/5 hover:shadow-xl hover:shadow-black/10 transition-all duration-300 hover:bg-background/60">
      <div className="relative">
        <Link href={file.urlPath} className="block">
          <div className="relative aspect-square bg-muted flex items-center justify-center">
            {getFileIcon(file.mimeType, 'h-16 w-16 text-muted-foreground')}
          </div>
        </Link>

        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-3">
          <Button variant="secondary" className="glass-hover" size="sm" asChild>
            <Link href={file.urlPath}>View</Link>
          </Button>

          <div className="flex gap-1">
            <TooltipProvider delayDuration={150}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="secondary"
                    size="icon"
                    className="h-8 w-8 glass-hover"
                    onClick={handleCopyLink}
                  >
                    <LinkIcon className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Copy link</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="secondary"
                    size="icon"
                    className="h-8 w-8 glass-hover"
                    asChild
                  >
                    <a href={file.urlPath} download={file.name}>
                      <Download className="h-4 w-4" />
                    </a>
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
                    onClick={() => setIsDeleteDialogOpen(true)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Delete</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>

        <div className="absolute bottom-2 right-2">
          <TooltipProvider delayDuration={150}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-background/80 text-xs backdrop-blur-sm">
                  <Clock className="h-3 w-3" />
                  {getRelativeTime(new Date(file.uploadedAt))}
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" align="end" sideOffset={8}>
                {new Date(file.uploadedAt).toLocaleDateString(undefined, {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      <div className="p-3">
        <div className="flex items-center justify-between gap-2">
          <TooltipProvider delayDuration={150}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  href={file.urlPath}
                  className="font-medium hover:underline truncate block text-sm"
                >
                  {file.name}
                </Link>
              </TooltipTrigger>
              <TooltipContent side="top" align="start">
                {file.name}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {formatBytes(file.size)}
          </span>
        </div>
      </div>

      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete File</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p>
              Are you sure you want to delete this file? This action cannot be
              undone.
            </p>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setIsDeleteDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  setIsDeleteDialogOpen(false)
                  handleDelete()
                }}
              >
                Delete
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
