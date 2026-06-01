'use client'

import { useEffect, useState } from 'react'

import DOMPurify from 'dompurify'
import { Download, Eye, Link } from 'lucide-react'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'

import { useFileActions } from '@/hooks/use-file-actions'

interface FileActionsProps {
  urlPath: string
  name: string
  mimeType: string
  verifiedPassword?: string
  fileId?: string
}

function canViewInBrowser(mimeType: string, filename: string): boolean {
  const mime = mimeType.toLowerCase()
  const name = filename.toLowerCase()

  // Standard browser viewable mime types
  if (
    mime.startsWith('image/') ||
    mime.startsWith('video/') ||
    mime.startsWith('audio/') ||
    mime === 'application/pdf' ||
    mime.startsWith('text/') ||
    mime === 'application/json' ||
    mime === 'application/ld+json' ||
    mime === 'application/xml' ||
    mime === 'image/svg+xml'
  ) {
    return true
  }

  // Extensions that browsers can display
  const viewableExtensions = [
    '.pdf', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.txt',
    '.mp4', '.webm', '.mp3', '.wav', '.json', '.html', '.css', '.js',
    '.ts', '.tsx', '.jsx', '.xml', '.svg'
  ]
  return viewableExtensions.some(ext => name.endsWith(ext))
}

export function FileActions({
  urlPath,
  name,
  mimeType,
  verifiedPassword,
  fileId,
}: FileActionsProps) {
  const [isNotViewableOpen, setIsNotViewableOpen] = useState(false)
  const [urls, setUrls] = useState<{ fileUrl: string; rawUrl: string }>()

  const { copyUrl, download, openRaw } = useFileActions({
    urlPath,
    name,
    fileId,
    verifiedPassword,
  })

  useEffect(() => {
    const passwordParam = verifiedPassword
      ? `?password=${encodeURIComponent(DOMPurify.sanitize(verifiedPassword))}`
      : ''
    const sanitizedUrlPath = DOMPurify.sanitize(urlPath)
    const fileUrl = `/api/files${sanitizedUrlPath}${passwordParam}`
    const rawUrl = `${sanitizedUrlPath}/raw${passwordParam}`
    setUrls({ fileUrl, rawUrl })
  }, [urlPath, verifiedPassword])

  if (!urls) return null

  const handleView = () => {
    if (canViewInBrowser(mimeType, name)) {
      openRaw()
    } else {
      setIsNotViewableOpen(true)
    }
  }

  return (
    <div className="flex items-center justify-center flex-wrap gap-3">
      <Button
        variant="outline"
        size="sm"
        onClick={copyUrl}
        className="bg-background/50 backdrop-blur-sm border-border/40 hover:bg-background/80 rounded-xl"
      >
        <Link className="h-4 w-4 mr-2" />
        Copy URL
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={download}
        className="bg-background/50 backdrop-blur-sm border-border/40 hover:bg-background/80 rounded-xl"
      >
        <Download className="h-4 w-4 mr-2" />
        Download
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={handleView}
        className="bg-background/50 backdrop-blur-sm border-border/40 hover:bg-background/80 rounded-xl"
      >
        <Eye className="h-4 w-4 mr-2" />
        View
      </Button>

      <AlertDialog open={isNotViewableOpen} onOpenChange={setIsNotViewableOpen}>
        <AlertDialogContent className="border border-border/50 bg-background/90 backdrop-blur-xl shadow-2xl rounded-2xl max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl font-semibold flex items-center gap-2">
              <span className="p-2 rounded-lg bg-yellow-500/10 text-yellow-500">
                <Eye className="h-5 w-5" />
              </span>
              Cannot View File
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground mt-2 leading-relaxed">
              This file format <strong className="text-foreground">{name.split('.').pop()?.toUpperCase() || 'unknown'}</strong> cannot be viewed directly in the browser. 
              Please download the file to view its contents on your device.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-6 flex flex-col-reverse sm:flex-row gap-2 sm:gap-0">
            <AlertDialogCancel className="bg-background/40 hover:bg-background/80 rounded-xl border border-border/40 transition-colors">
              Close
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                download()
                setIsNotViewableOpen(false)
              }}
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-medium rounded-xl shadow-lg shadow-primary/25 transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              <Download className="h-4 w-4 mr-2" />
              Download File
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

