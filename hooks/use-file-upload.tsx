import React, { useCallback, useEffect, useRef, useState } from 'react'

import { useRouter } from 'next/navigation'

import { Progress } from '@/components/ui/progress'
import { ToastAction } from '@/components/ui/toast'

import { useToast } from './use-toast'

export type FileWithPreview = File & {
  preview?: string
  progress: number
  uploaded: number
}

export type UploadResponse = {
  url: string
  name: string
  size: number
  type: string
}

export type FileUploadOptions = {
  path?: string
  maxSize?: number
  onUploadComplete?: (responses: UploadResponse[]) => void
  onUploadError?: (error: string) => void
}

export function useFileUpload(options: FileUploadOptions = {}) {
  const [files, setFiles] = useState<FileWithPreview[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const router = useRouter()
  const { toast } = useToast()
  const progressToastRef = useRef<ReturnType<typeof toast> | null>(null)

  const onDrop = useCallback((acceptedFiles: File[]) => {
    setFiles((prev) => [
      ...prev,
      ...acceptedFiles.map((file) =>
        Object.assign(file, {
          preview: file.type.startsWith('image/')
            ? URL.createObjectURL(file)
            : undefined,
          progress: 0,
          uploaded: 0,
        })
      ),
    ])
  }, [])

  useEffect(() => {
    return () => {
      for (const file of files) {
        if (file.preview) {
          URL.revokeObjectURL(file.preview)
        }
      }
    }
  }, [files])

  const removeFile = (index: number) => {
    setFiles((prev) => {
      const newFiles = [...prev]
      const file = newFiles[index]
      if (file.preview) {
        URL.revokeObjectURL(file.preview)
      }
      newFiles.splice(index, 1)
      return newFiles
    })
  }

  const clearFiles = () => {
    for (const file of files) {
      if (file.preview) {
        URL.revokeObjectURL(file.preview)
      }
    }
    setFiles([])
  }

  const updateFileProgress = (index: number, uploaded: number, total: number) => {
    setFiles((prev) => {
      const newFiles = [...prev]
      newFiles[index] = {
        ...newFiles[index],
        progress: Math.min(100, Math.round((uploaded / total) * 100)),
        uploaded,
      }
      return newFiles
    })

    const file = files[index]
    if (file && progressToastRef.current) {
      const progress = Math.min(100, Math.round((uploaded / total) * 100))
      progressToastRef.current.update({
        id: progressToastRef.current.id,
        title: 'Uploading...',
        description: (
          <div className="space-y-2">
            <p className="text-sm">{file.name}</p>
            <Progress value={progress} className="h-2" />
            <p className="text-xs text-muted-foreground">{progress}%</p>
          </div>
        ),
      })
    }
  }

  const uploadFileDirectly = async (
    file: FileWithPreview,
    index: number
  ): Promise<UploadResponse> => {
    const formData = new FormData()
    formData.append('file', file)
    if (options.path) formData.append('path', options.path)

    const xhr = new XMLHttpRequest()
    return await new Promise<UploadResponse>((resolve, reject) => {
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          updateFileProgress(index, event.loaded, event.total)
        }
      })

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          updateFileProgress(index, file.size, file.size)
          const response = JSON.parse(xhr.responseText)
          resolve(response.data || response)
        } else {
          reject(new Error(`Upload failed: ${xhr.statusText}`))
        }
      })

      xhr.addEventListener('error', () => {
        reject(new Error('Network error occurred'))
      })

      xhr.open('POST', '/api/files')
      xhr.send(formData)
    })
  }

  const uploadFiles = async () => {
    if (files.length === 0) return

    setIsUploading(true)
    const responses: UploadResponse[] = []

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i]

        progressToastRef.current = toast({
          title: 'Uploading...',
          description: (
            <div className="space-y-2">
              <p className="text-sm">{file.name}</p>
              <Progress value={0} className="h-2" />
              <p className="text-xs text-muted-foreground">0%</p>
            </div>
          ),
          duration: Infinity,
        })

        const response = await uploadFileDirectly(file, i)
        responses.push(response)

        progressToastRef.current?.dismiss()
        progressToastRef.current = null
      }

      toast({
        title: 'Upload Complete',
        description: `Successfully uploaded ${responses.length} file${responses.length > 1 ? 's' : ''}`,
        action: responses.length > 0 ? (
          <ToastAction
            altText="Copy links"
            onClick={() => {
              const links = responses.map((r) => r.url).join('\n')
              navigator.clipboard.writeText(links)
              toast({ title: 'Links copied', description: 'All file links copied to clipboard' })
            }}
          >
            Copy Links
          </ToastAction>
        ) : undefined,
      })

      if (options.onUploadComplete) {
        options.onUploadComplete(responses)
      }

      clearFiles()
      router.refresh()
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Upload failed'
      toast({
        title: 'Upload Failed',
        description: errorMessage,
        variant: 'destructive',
      })

      if (options.onUploadError) {
        options.onUploadError(errorMessage)
      }
    } finally {
      setIsUploading(false)
    }
  }

  return {
    files,
    isUploading,
    onDrop,
    removeFile,
    clearFiles,
    uploadFiles,
  }
}
