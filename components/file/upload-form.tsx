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
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set())
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState<Record<string, number>>({})
  const [overallProgress, setOverallProgress] = useState<{ uploaded: number; total: number; failed: number } | null>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)

  const onDrop = useCallback((acceptedFiles: File[]) => {
    setFiles((prev) => {
      const newFiles = [...prev, ...acceptedFiles]
      setSelectedIndices((prevSel) => {
        const next = new Set(prevSel)
        for (let i = prev.length; i < newFiles.length; i++) next.add(i)
        return next
      })
      return newFiles
    })
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
    setFiles((prev) => {
      const newFiles = [...prev, ...selectedFiles]
      setSelectedIndices((prevSel) => {
        const next = new Set(prevSel)
        for (let i = prev.length; i < newFiles.length; i++) next.add(i)
        return next
      })
      return newFiles
    })
    e.target.value = ''
  }

  const toggleFile = (index: number) => {
    setSelectedIndices((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index))
    setSelectedIndices((prev) => {
      const next = new Set<number>()
      for (const i of prev) {
        if (i < index) next.add(i)
        else if (i > index) next.add(i - 1)
      }
      return next
    })
  }

  const uploadFiles = async () => {
    const targetFiles = files.filter((_, i) => selectedIndices.has(i))
    if (targetFiles.length === 0) return

    setUploading(true)
    setOverallProgress({ uploaded: 0, total: targetFiles.length, failed: 0 })

    const CONCURRENCY = 5
    const pending = [...targetFiles]
    let index = 0
    let completed = 0
    let failed = 0

    const uploadOne = async (): Promise<void> => {
      while (true) {
        const i = index++
        if (i >= pending.length) return
        const file = pending[i]
        const displayName = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name

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

          completed++
        } catch {
          failed++
        }

        setOverallProgress({ uploaded: completed, total: targetFiles.length, failed })
      }
    }

    const workers = Array.from({ length: CONCURRENCY }, () => uploadOne())
    await Promise.all(workers)

    setUploading(false)
    setFiles([])
    setProgress({})
    setOverallProgress(null)
    setSelectedIndices(new Set())

    if (failed > 0) {
      toast({
        title: 'Upload complete with errors',
        description: `${completed} uploaded, ${failed} failed`,
        variant: 'destructive',
      })
    } else {
      toast({
        title: 'Upload complete',
        description: `${completed} file${completed > 1 ? 's' : ''} uploaded successfully`,
      })
    }
  }

  const selectedCount = selectedIndices.size

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
            {!uploading && (
              <span className="text-sm text-muted-foreground ml-2">
                ({selectedCount} to upload)
              </span>
            )}
          </h3>

          {overallProgress && (
            <div className="space-y-1">
              <div className="flex justify-between text-sm">
                <span>
                  {overallProgress.uploaded + overallProgress.failed} / {overallProgress.total} files
                  {overallProgress.failed > 0 && (
                    <span className="text-destructive ml-1">
                      ({overallProgress.failed} failed)
                    </span>
                  )}
                </span>
                <span>
                  {Math.round(((overallProgress.uploaded + overallProgress.failed) / overallProgress.total) * 100)}%
                </span>
              </div>
              <Progress
                value={((overallProgress.uploaded + overallProgress.failed) / overallProgress.total) * 100}
                className="h-2"
              />
            </div>
          )}

          <div className="max-h-64 overflow-y-auto space-y-1">
            {files.map((file, index) => {
              const displayName = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name
              const isSelected = selectedIndices.has(index)
              const isDone = progress[displayName] === 100
              return (
                <div
                  key={`${file.name}-${index}-${file.size}`}
                  className={`flex items-center gap-3 p-2 rounded-lg ${
                    !isSelected && !uploading ? 'opacity-40' : ''
                  } ${isDone ? 'bg-primary/10' : 'bg-muted/50'}`}
                >
                  {!uploading && (
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleFile(index)}
                      className="shrink-0 w-4 h-4 accent-primary cursor-pointer"
                    />
                  )}
                  {uploading && isDone && (
                    <span className="text-green-500 text-sm font-bold w-4 text-center">✓</span>
                  )}
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

          {!uploading ? (
            <Button
              onClick={uploadFiles}
              disabled={selectedCount === 0}
              className="w-full"
            >
              <UploadIcon className="h-4 w-4 mr-2" />
              Upload {selectedCount} file{selectedCount > 1 ? 's' : ''}
            </Button>
          ) : (
            <div className="text-center text-sm text-muted-foreground py-2">
              Uploading...
            </div>
          )}
        </Card>
      )}
    </div>
  )
}
