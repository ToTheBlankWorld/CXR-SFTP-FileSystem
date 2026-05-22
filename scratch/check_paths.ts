import { prisma } from '../lib/database/prisma'
import { listDir } from '../lib/sftp'

async function run() {
  console.log('--- SFTP ROOT LISTING ---')
  try {
    const rootFiles = await listDir('/')
    console.log('SFTP rootFiles paths:', rootFiles.map(f => ({ name: f.name, path: f.path })))
  } catch (err) {
    console.error('SFTP listDir error:', err)
  }

  console.log('--- PRISMA DB FILES ---')
  try {
    const dbFiles = await prisma.file.findMany()
    console.log('Prisma files:', dbFiles.map(f => ({ name: f.name, path: f.path, urlPath: f.urlPath, visibility: f.visibility })))
  } catch (err) {
    console.error('Prisma query error:', err)
  }
}

run().then(() => prisma.$disconnect())
