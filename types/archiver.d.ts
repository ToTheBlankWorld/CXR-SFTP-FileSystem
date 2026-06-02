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

  export class Archiver extends Transform {
    append(source: string | Buffer | Readable, data: EntryData): this
    finalize(): void
  }

  export class ZipArchive extends Archiver {
    constructor(options?: ArchiverOptions)
  }

  export class TarArchive extends Archiver {
    constructor(options?: ArchiverOptions)
  }
}
