declare module 'ssh2-sftp-client' {
  import { Readable, Writable } from 'stream'

  interface FileInfo {
    type: string
    name: string
    size: number
    modifyTime: number
    accessTime: number
    rights: { user: string; group: string; other: string }
    owner: number
    group: number
  }

  interface StatInfo {
    size: number
    modifyTime: number
    accessTime: number
    mode: number
    uid: number
    gid: number
    isDirectory: () => boolean
    isFile: () => boolean
  }

  interface ReadStreamOptions {
    start?: number
    end?: number
  }

  interface ConnectOptions {
    host: string
    port: number
    username: string
    password?: string
    privateKey?: Buffer | string
    readyTimeout?: number
    retries?: number
    retry_factor?: number
    retry_minTimeout?: number
  }

  class Client {
    connect(options: ConnectOptions): Promise<void>
    list(path: string): Promise<FileInfo[]>
    get(path: string, dst?: string | Writable): Promise<Readable | Buffer>
    put(input: string | Buffer | Readable, remotePath: string): Promise<void>
    delete(path: string): Promise<void>
    rmdir(path: string, recursive?: boolean): Promise<void>
    mkdir(path: string, recursive?: boolean): Promise<void>
    rename(fromPath: string, toPath: string): Promise<void>
    stat(path: string): Promise<StatInfo>
    realpath(path: string): Promise<string>
    createReadStream(path: string, options?: ReadStreamOptions): Readable
    end(): Promise<void>
    on(event: string, callback: (...args: any[]) => void): void
  }

  export default Client
}
