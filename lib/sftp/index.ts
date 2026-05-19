import { Readable } from 'stream'

import Client from 'ssh2-sftp-client'

import { loggers } from '@/lib/logger'

import type { SftpConfig, SftpEntry } from './types'

const logger = loggers.storage

let cachedConfig: SftpConfig | null = null

let client: Client | null = null
let clientPromise: Promise<Client> | null = null

export function getSftpConfig(): SftpConfig {
  if (cachedConfig) return cachedConfig
  cachedConfig = {
    host: process.env.SFTP_HOST || '192.168.0.200',
    port: parseInt(process.env.SFTP_PORT || '22', 10),
    username: process.env.SFTP_USERNAME || '',
    password: process.env.SFTP_PASSWORD || undefined,
    privateKey: process.env.SFTP_PRIVATE_KEY || undefined,
    rootPath: process.env.SFTP_ROOT_PATH || '/',
  }
  return cachedConfig
}

async function connect(): Promise<Client> {
  const config = getSftpConfig()
  const c = new Client()
  const connectConfig: {
    host: string; port: number; username: string; password?: string;
    privateKey?: string; readyTimeout?: number;
  } = {
    host: config.host,
    port: config.port,
    username: config.username,
    readyTimeout: 5000,
  }
  if (config.privateKey) {
    connectConfig.privateKey = config.privateKey
  } else if (config.password) {
    connectConfig.password = config.password
  }
  await c.connect(connectConfig)
  logger.info('SFTP persistent client connected')
  return c
}

async function getClient(): Promise<Client> {
  if (client) return client
  if (clientPromise) return clientPromise
  clientPromise = connect()
  client = await clientPromise
  clientPromise = null
  return client
}

async function withClient<T>(fn: (sftp: Client) => Promise<T>): Promise<T> {
  try {
    return await fn(await getClient())
  } catch {
    client = null
    clientPromise = null
    const c = await getClient()
    return await fn(c)
  }
}

function resolvePath(...segments: string[]): string {
  const root = getSftpConfig().rootPath.replace(/\/$/, '')
  const joined = segments.join('/').replace(/\/+/g, '/')
  if (!root) return joined
  const sep = joined.startsWith('/') ? '' : '/'
  return `${root}${sep}${joined}`.replace(/\/+/g, '/')
}

function stripRoot(absPath: string): string {
  const root = getSftpConfig().rootPath.replace(/\/$/, '')
  if (root === '') return absPath
  return absPath.replace(root, '') || '/'
}

export async function listDir(dirPath: string = ''): Promise<SftpEntry[]> {
  return withClient(async (sftp) => {
    const fullPath = resolvePath(dirPath)
    logger.debug('Listing SFTP directory', { fullPath })

    const entries = await sftp.list(fullPath)
    return entries.map((e) => ({
      name: e.name,
      path: stripRoot(`${fullPath}/${e.name}`.replace(/\/+/g, '/')),
      type: e.type === 'd' ? 'directory' : 'file',
      size: e.size,
      modifyTime: new Date(e.modifyTime * 1000),
      accessTime: new Date(e.accessTime * 1000),
      mode: 0,
      owner: e.owner,
      group: e.group,
    }))
  })
}

export async function uploadFile(
  localBuffer: Buffer,
  remotePath: string
): Promise<void> {
  return withClient(async (sftp) => {
    const fullPath = resolvePath(remotePath)
    await sftp.put(Readable.from(localBuffer), fullPath)
  })
}

export async function downloadFile(remotePath: string): Promise<Buffer> {
  return withClient(async (sftp) => {
    const fullPath = resolvePath(remotePath)
    logger.debug('Downloading file via SFTP', { fullPath })

    const chunks: Buffer[] = []
    const stream = sftp.createReadStream(fullPath)

    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk))
    }

    return Buffer.concat(chunks)
  })
}

export async function getFileStream(
  remotePath: string,
  range?: { start?: number; end?: number }
): Promise<Readable> {
  const sftp = await getClient()
  const fullPath = resolvePath(remotePath)

  const readStream = sftp.createReadStream(fullPath, {
    start: range?.start,
    end: range?.end,
  })

  return readStream as unknown as Readable
}

export async function getFileInfo(
  remotePath: string
): Promise<SftpEntry | null> {
  try {
    return await withClient(async (sftp) => {
      const fullPath = resolvePath(remotePath)
      const stat = await sftp.stat(fullPath)
      return {
        name: remotePath.split('/').pop() || '',
        path: stripRoot(fullPath),
        type: stat.isDirectory() ? 'directory' : 'file',
        size: stat.size,
        modifyTime: new Date(stat.modifyTime * 1000),
        accessTime: new Date(stat.accessTime * 1000),
        mode: stat.mode,
        owner: stat.uid,
        group: stat.gid,
      }
    })
  } catch {
    return null
  }
}

export async function deleteFile(remotePath: string): Promise<void> {
  return withClient(async (sftp) => {
    const fullPath = resolvePath(remotePath)
    logger.debug('Deleting file via SFTP', { fullPath })
    await sftp.delete(fullPath)
  })
}

export async function deleteDir(remotePath: string): Promise<void> {
  return withClient(async (sftp) => {
    const fullPath = resolvePath(remotePath)
    logger.debug('Deleting directory via SFTP', { fullPath })
    await sftp.rmdir(fullPath, true)
  })
}

export async function rename(
  oldPath: string,
  newPath: string
): Promise<void> {
  return withClient(async (sftp) => {
    const fullOldPath = resolvePath(oldPath)
    const fullNewPath = resolvePath(newPath)
    logger.debug('Renaming via SFTP', { from: fullOldPath, to: fullNewPath })
    await sftp.rename(fullOldPath, fullNewPath)
  })
}

export async function mkdir(dirPath: string): Promise<void> {
  return withClient(async (sftp) => {
    const fullPath = resolvePath(dirPath)
    logger.debug('Creating directory via SFTP', { fullPath })
    await sftp.mkdir(fullPath, true)
  })
}

export async function disconnect(): Promise<void> {
  if (client) {
    await client.end().catch(() => {})
    client = null
  }
}

export async function listAllFilesRecursive(
  dirPath: string = ''
): Promise<{ path: string; name: string; size: number }[]> {
  const results: { path: string; name: string; size: number }[] = []
  const entries = await listDir(dirPath)
  for (const entry of entries) {
    if (entry.type === 'directory') {
      const sub = await listAllFilesRecursive(entry.path)
      results.push(...sub)
    } else {
      results.push({ path: entry.path, name: entry.name, size: entry.size })
    }
  }
  return results
}

export async function testConnection(): Promise<{
  success: boolean
  error?: string
}> {
  try {
    await withClient(async () => {})
    return { success: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Connection failed'
    logger.error('SFTP connection test failed', error as Error)
    return { success: false, error: message }
  }
}
