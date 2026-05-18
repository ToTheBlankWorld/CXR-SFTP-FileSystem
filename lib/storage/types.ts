export interface FileEntry {
  name: string
  path: string
  type: 'file' | 'directory'
  size: number
  modifyTime: Date
}
