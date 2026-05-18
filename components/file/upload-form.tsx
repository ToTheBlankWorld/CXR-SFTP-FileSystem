'use client'

import { useCallback, useRef, useState } from 'react'

import { useSearchParams } from 'next/navigation'

import { FileIcon, FolderIcon, UploadIcon, XIcon } from 'lucide-react'
import { useDropzone } from 'react-dropzone'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'

import { useToast } from '@/hooks/use-toast'

export function UploadForm() {
  const { toast } = useToast()
  const searchParams = useSearchParams()
  const uploadPath = searchParams.get('path') || '/'

  const [files, setFiles] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState<Record<string, number>>({})
  const folderInputRef = useRef<HTMLInputElement>(null)

  const onDrop = useCallback((acceptedFiles: File[]) => {
    setFiles((prev) => [...prev, ...acceptedFiles])
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: true,
  })

  const handleFolderSelect = () => {
    folderInputRef.current?.click()
  }

  const onFolderFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || [])
    setFiles((prev) => [...prev, ...selectedFiles])
    e.target.value = ''
  }

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const uploadFiles = async () => {
    if (files.length === 0) return

    setUploading(true)
    let successCount = 0
    let failCount = 0

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const displayName = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name
      setProgress((prev) => ({ ...prev, [displayName]: 0 }))

      let uploaded = false
      for (let attempt = 0; attempt < 3 && !uploaded; attempt++) {
        try {
          const formData = new FormData()
          formData.append('file', file)
          formData.append('path', uploadPath)

          const relPath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || ''
          const dirPart = relPath.substring(0, relPath.lastIndexOf('/'))
          if (dirPart) formData.append('subpath', dirPart)

          await new Promise<void>((resolve, reject) => {
            const xhr = new XMLHttpRequest()

            xhr.upload.addEventListener('progress', (e) => {
              if (e.lengthComputable) {
                const pct = Math.round((e.loaded / e.total) * 100)
                setProgress((prev) => ({ ...prev, [displayName]: pct }))
              }
            })

            xhr.addEventListener('load', () => {
              if (xhr.status >= 200 && xhr.status < 300) {
                resolve()
              } else {
                reject(new Error(xhr.statusText))
              }
            })

            xhr.addEventListener('error', () => reject(new Error('Network error')))

            xhr.open('POST', '/api/files')
            xhr.send(formData)
          })

          uploaded = true
          successCount++
        } catch {
          if (attempt < 2) continue
          failCount++
        }
      }
    }

    setUploading(false)
    setFiles([])
    setProgress({})

    if (failCount > 0) {
      toast({
        title: 'Upload complete with errors',
        description: `${successCount} uploaded, ${failCount} failed`,
        variant: 'destructive',
      })
    } else {
      toast({
        title: 'Upload complete',
        description: `${successCount} file${successCount > 1 ? 's' : ''} uploaded successfully`,
      })
    }
  }

  return (
    <div className="space-y-6">
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${
          isDragActive
            ? 'border-primary bg-primary/5'
            : 'border-border hover:border-primary/50'
        }`}
      >
        <input {...getInputProps()} />
        <UploadIcon className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
        <p className="text-lg font-medium">
          {isDragActive
            ? 'Drop files here...'
            : 'Drag & drop files here, or click to select'}
        </p>
        <p className="text-sm text-muted-foreground mt-2">
          Uploading to: <code className="bg-muted px-1 py-0.5 rounded">{uploadPath}</code>
        </p>
      </div>

      <div className="flex gap-2 justify-center">
        <Button variant="outline" onClick={handleFolderSelect}>
          <FolderIcon className="h-4 w-4 mr-2" />
          Upload Folder
        </Button>
        <input
          ref={folderInputRef}
          type="file"
          className="hidden"
          {...{ webkitdirectory: '' } as React.InputHTMLAttributes<HTMLInputElement>}
          multiple
          onChange={onFolderFilesSelected}
        />
      </div>

      {files.length > 0 && (
        <Card className="p-4 space-y-3">
          <h3 className="font-medium">
            {files.length} file{files.length > 1 ? 's' : ''} selected
          </h3>
          <div className="max-h-64 overflow-y-auto space-y-1">
            {files.map((file, index) => {
      const displayName = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name
              return (
                <div
                  key={`${file.name}-${index}-${file.size}`}
                  className="flex items-center gap-3 p-2 rounded-lg bg-muted/50"
                >
                  <FileIcon className="h-8 w-8 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{displayName}</p>
                    <p className="text-xs text-muted-foreground">
                      {(file.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                    {progress[displayName] !== undefined && (
                      <Progress value={progress[displayName]} className="h-1 mt-1" />
                    )}
                  </div>
                  {!uploading && (
                    <button
                      onClick={() => removeFile(index)}
                      className="shrink-0 p-1 hover:bg-muted rounded"
                    >
                      <XIcon className="h-4 w-4" />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
          <Button
            onClick={uploadFiles}
            disabled={uploading}
            className="w-full"
          >
            {uploading ? 'Uploading...' : `Upload ${files.length} file${files.length > 1 ? 's' : ''}`}
          </Button>
        </Card>
      )}
    </div>
  )
}
