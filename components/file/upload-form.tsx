'use client'

import { useCallback, useMemo, useRef, useState } from 'react'

import { useSearchParams } from 'next/navigation'

import {
  ChevronDown,
  ChevronRight,
  FileIcon,
  FolderIcon,
  UploadIcon,
  Settings2,
  KeyRound,
  Eye,
  CalendarDays,
} from 'lucide-react'
import { useDropzone } from 'react-dropzone'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import { useToast } from '@/hooks/use-toast'

interface TreeNode {
  name: string
  type: 'file' | 'folder'
  children: TreeNode[]
  file?: File
  fileCount: number
  totalSize: number
  path: string
}

function buildTree(files: File[]): TreeNode {
  const root: TreeNode = {
    name: '', type: 'folder', children: [],
    fileCount: 0, totalSize: 0, path: '',
  }
  for (const file of files) {
    const relPath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name
    const parts = relPath.split('/')
    let current = root
    let curPath = ''
    for (let i = 0; i < parts.length; i++) {
      curPath = curPath ? `${curPath}/${parts[i]}` : parts[i]
      if (i === parts.length - 1) {
        current.children.push({
          name: parts[i], type: 'file', children: [],
          file, fileCount: 1, totalSize: file.size, path: curPath,
        })
      } else {
        let folder = current.children.find(
          (c) => c.type === 'folder' && c.name === parts[i]
        )
        if (!folder) {
          folder = {
            name: parts[i], type: 'folder', children: [],
            fileCount: 0, totalSize: 0, path: curPath,
          }
          current.children.push(folder)
        }
        current = folder
      }
    }
  }
  function calc(node: TreeNode): void {
    if (node.type === 'file') return
    node.fileCount = 0; node.totalSize = 0
    for (const child of node.children) {
      calc(child)
      node.fileCount += child.fileCount
      node.totalSize += child.totalSize
    }
  }
  calc(root)
  return root
}

function getSelectedFiles(
  node: TreeNode,
  deselectedPaths: Set<string>
): File[] {
  if (node.type === 'folder' && deselectedPaths.has(node.path)) return []
  if (node.type === 'file') return node.file ? [node.file] : []
  const result: File[] = []
  for (const child of node.children) result.push(...getSelectedFiles(child, deselectedPaths))
  return result
}

function countSelected(
  node: TreeNode,
  deselectedPaths: Set<string>
): number {
  if (node.type === 'folder' && deselectedPaths.has(node.path)) return 0
  if (node.type === 'file') return 1
  let count = 0
  for (const child of node.children) count += countSelected(child, deselectedPaths)
  return count
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1024 / 1024).toFixed(1) + ' MB'
}

export function UploadForm() {
  const { toast } = useToast()
  const searchParams = useSearchParams()
  const uploadPath = searchParams.get('path') || '/'

  const [files, setFiles] = useState<File[]>([])
  const [deselectedPaths, setDeselectedPaths] = useState<Set<string>>(new Set())
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set())
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState<Record<string, number>>({})
  const [overallProgress, setOverallProgress] = useState<{ uploaded: number; total: number; failed: number } | null>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)

  // Advanced Options States
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [enablePassword, setEnablePassword] = useState(false)
  const [passwordValue, setPasswordValue] = useState('')
  const [enableVisibility, setEnableVisibility] = useState(false)
  const [visibilityValue, setVisibilityValue] = useState<'PUBLIC' | 'PRIVATE' | 'USERS_AND_ADMINS' | 'USER_ONLY'>('PUBLIC')
  const [enableExpiration, setEnableExpiration] = useState(false)
  const [expirationValue, setExpirationValue] = useState('')

  const tree = useMemo(() => files.length > 0 ? buildTree(files) : null, [files])

  const selectedCount = useMemo(
    () => tree ? countSelected(tree, deselectedPaths) : 0,
    [tree, deselectedPaths]
  )

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
    if (selectedFiles.length === 0) return
    setFiles((prev) => {
      const newFiles = [...prev, ...selectedFiles]
      return newFiles
    })
    setExpandedPaths((prev) => {
      const next = new Set(prev)
      for (const f of selectedFiles) {
        const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || ''
        const firstSlash = rel.indexOf('/')
        if (firstSlash > 0) next.add(rel.substring(0, firstSlash))
      }
      return next
    })
    e.target.value = ''
  }

  const toggleFolder = (path: string) => {
    setDeselectedPaths((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const toggleExpand = (path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const uploadFiles = async () => {
    if (!tree) return
    const targetFiles = getSelectedFiles(tree, deselectedPaths)
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
          if (dirPart) {
            formData.append('subpath', dirPart)
            formData.append('fullpath', relPath)
          }

          // Append access protection options if enabled
          if (enablePassword && passwordValue) {
            formData.append('password', passwordValue)
          }
          if (enableVisibility) {
            formData.append('visibility', visibilityValue)
          }
          if (enableExpiration && expirationValue) {
            formData.append('expiresAt', new Date(expirationValue).toISOString())
          }

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

            // Pass unlocked passwords from localStorage
            const storedPasswords = localStorage.getItem('cxr_folder_passwords')
            if (storedPasswords) {
              xhr.setRequestHeader('x-folder-password', encodeURIComponent(storedPasswords))
            }

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
    setDeselectedPaths(new Set())
    setExpandedPaths(new Set())

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

  function renderNode(node: TreeNode, depth: number = 0): React.ReactNode {
    if (node.type === 'file') {
      const displayName = node.path
      const pct = progress[displayName]
      const isDone = pct === 100
      return (
        <div
          key={node.path}
          className="flex items-center gap-2 py-1.5 px-2 rounded"
          style={{ paddingLeft: `${depth * 20 + 8}px` }}
        >
          <div className="w-4 shrink-0" />
          {uploading && isDone ? (
            <span className="text-green-500 text-xs font-bold w-4 text-center shrink-0">✓</span>
          ) : (
            <FileIcon className="h-4 w-4 text-muted-foreground shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm truncate">{node.name}</span>
              <span className="text-xs text-muted-foreground shrink-0">{formatSize(node.totalSize)}</span>
            </div>
            {pct !== undefined && pct < 100 && (
              <Progress value={pct} className="h-1 mt-0.5" />
            )}
          </div>
        </div>
      )
    }

    const isExpanded = expandedPaths.has(node.path)
    const isDeselected = deselectedPaths.has(node.path)

    return (
      <div key={node.path}>
        <div
          className={`flex items-center gap-2 py-1.5 px-2 rounded hover:bg-muted/50 cursor-pointer ${
            isDeselected ? 'opacity-40' : ''
          }`}
          style={{ paddingLeft: `${depth * 20 + 8}px` }}
        >
          {!uploading && (
            <input
              type="checkbox"
              checked={!isDeselected}
              onChange={() => toggleFolder(node.path)}
              className="shrink-0 w-4 h-4 accent-primary cursor-pointer"
            />
          )}
          {uploading && (
            <div className="w-4 shrink-0" />
          )}
          <button
            onClick={(e) => { e.stopPropagation(); toggleExpand(node.path) }}
            className="shrink-0 p-0.5 hover:bg-muted rounded"
          >
            {isExpanded ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
          </button>
          <FolderIcon className="h-5 w-5 text-muted-foreground shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="text-sm font-medium truncate">{node.name || '(root)'}</span>
            <span className="text-xs text-muted-foreground ml-2">{formatSize(node.totalSize)}</span>
          </div>
        </div>
        {isExpanded && (
          <div>
            {node.children.map((child) => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    )
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

      <div
        onClick={handleFolderSelect}
        className="border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors border-border hover:border-primary/50 hover:bg-primary/5"
      >
        <FolderIcon className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
        <p className="text-base font-medium">Click to select a folder</p>
        <p className="text-sm text-muted-foreground mt-1">
          All files and subfolders will be included
        </p>
        <input
          ref={folderInputRef}
          type="file"
          className="hidden"
          {...{ webkitdirectory: '' } as React.InputHTMLAttributes<HTMLInputElement>}
          multiple
          onChange={onFolderFilesSelected}
        />
      </div>

      {/* Advanced Settings Card */}
      <Card className="overflow-hidden border border-border bg-card/60 backdrop-blur-md shadow-sm transition-all duration-300">
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex w-full items-center justify-between p-4 hover:bg-muted/30 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-primary animate-pulse" />
            <span className="font-semibold text-sm tracking-wide">Advanced Access Control Options</span>
          </div>
          {showAdvanced ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform duration-200" />
          )}
        </button>

        {showAdvanced && (
          <div className="border-t border-border p-5 space-y-6 bg-muted/10 animate-in fade-in slide-in-from-top-4 duration-300">
            {/* Password Protection */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                    <KeyRound className="h-4 w-4" />
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Password Protection</Label>
                    <p className="text-xs text-muted-foreground">Restrict file/folder opening with a password</p>
                  </div>
                </div>
                <Switch
                  checked={enablePassword}
                  onCheckedChange={setEnablePassword}
                  className="data-[state=checked]:bg-primary"
                />
              </div>
              {enablePassword && (
                <div className="pl-9 animate-in zoom-in-95 duration-200">
                  <Input
                    type="password"
                    placeholder="Enter folder/file password"
                    value={passwordValue}
                    onChange={(e) => setPasswordValue(e.target.value)}
                    className="max-w-md bg-background border-primary/20 focus:border-primary"
                  />
                </div>
              )}
            </div>

            {/* Visibility Settings */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                    <Eye className="h-4 w-4" />
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Visibility Restriction</Label>
                    <p className="text-xs text-muted-foreground">Configure who is authorized to view this resource</p>
                  </div>
                </div>
                <Switch
                  checked={enableVisibility}
                  onCheckedChange={setEnableVisibility}
                  className="data-[state=checked]:bg-primary"
                />
              </div>
              {enableVisibility && (
                <div className="pl-9 max-w-md animate-in zoom-in-95 duration-200">
                  <Select
                    value={visibilityValue}
                    onValueChange={(val) => setVisibilityValue(val as 'PUBLIC' | 'PRIVATE' | 'USERS_AND_ADMINS' | 'USER_ONLY')}
                  >
                    <SelectTrigger className="bg-background border-primary/20 focus:border-primary">
                      <SelectValue placeholder="Select visibility" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PUBLIC">Public (Visible to everyone)</SelectItem>
                      <SelectItem value="USER_ONLY">Standard Users Only (Exclude Admins)</SelectItem>
                      <SelectItem value="USERS_AND_ADMINS">Registered Users & Admins</SelectItem>
                      <SelectItem value="PRIVATE">Private (Only Me)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {/* Expiration Date */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                    <CalendarDays className="h-4 w-4" />
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Auto Expiration</Label>
                    <p className="text-xs text-muted-foreground">Delete or restrict access automatically after datetime</p>
                  </div>
                </div>
                <Switch
                  checked={enableExpiration}
                  onCheckedChange={setEnableExpiration}
                  className="data-[state=checked]:bg-primary"
                />
              </div>
              {enableExpiration && (
                <div className="pl-9 animate-in zoom-in-95 duration-200">
                  <Input
                    type="datetime-local"
                    value={expirationValue}
                    min={new Date(Date.now() + 60000).toISOString().slice(0, 16)}
                    onChange={(e) => setExpirationValue(e.target.value)}
                    className="max-w-md bg-background border-primary/20 focus:border-primary text-foreground [color-scheme:dark]"
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </Card>

      {tree && (
        <Card className="p-4 space-y-3">
          <h3 className="font-medium">
            {tree.fileCount} file{tree.fileCount > 1 ? 's' : ''} selected
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

          <div className="max-h-80 overflow-y-auto border rounded-lg p-1">
            {tree.children.map((child) => renderNode(child))}
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
