export function getMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase()
  const map: Record<string, string> = {
    txt: 'text/plain', html: 'text/html', css: 'text/css', js: 'application/javascript',
    ts: 'application/typescript', tsx: 'application/typescript', jsx: 'application/javascript',
    json: 'application/json', xml: 'application/xml', pdf: 'application/pdf',
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
    svg: 'image/svg+xml', webp: 'image/webp', ico: 'image/x-icon', bmp: 'image/bmp',
    mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', avi: 'video/x-msvideo',
    mkv: 'video/x-matroska', m4v: 'video/x-m4v',
    mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', flac: 'audio/flac',
    zip: 'application/zip', tar: 'application/x-tar', gz: 'application/gzip',
    bz2: 'application/x-bzip2', rar: 'application/x-rar-compressed', '7z': 'application/x-7z-compressed',
    doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    cpp: 'text/x-c++src', h: 'text/x-c++hdr', c: 'text/x-csrc',
    py: 'text/x-python', java: 'text/x-java', rs: 'text/x-rust',
    go: 'text/x-go', rb: 'text/x-ruby', php: 'text/x-php',
    sh: 'application/x-sh', bat: 'application/x-bat',
    yaml: 'text/yaml', yml: 'text/yaml', md: 'text/markdown',
    csv: 'text/csv', sql: 'text/x-sql',
  }
  return ext ? (map[ext] || 'application/octet-stream') : 'application/octet-stream'
}
