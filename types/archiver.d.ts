declare module 'archiver' {
  import { Readable, Transform } from 'stream'

  interface ArchiverOptions {
    zlib?: { level?: number }
    store?: boolean
  }

  interface EntryData {
    name: string
    prefix?: string
    date?: Date
  }

  interface Archiver extends Transform {
    append(source: string | Buffer | Readable, data: EntryData): this
    finalize(): void
  }

  function archiver(format: string, options?: ArchiverOptions): Archiver

  export default archiver
}
