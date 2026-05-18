export interface SftpEntry {
  name: string
  path: string
  type: 'file' | 'directory'
  size: number
  modifyTime: Date
  accessTime: Date
  mode: number
  owner: number
  group: number
}

export interface SftpConfig {
  host: string
  port: number
  username: string
  password?: string
  privateKey?: string
  rootPath: string
}
