const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()

async function main() {
  console.log('Step 1: Adding TEAM enum value...')
  await p.$executeRawUnsafe(`ALTER TYPE "FileVisibility" ADD VALUE IF NOT EXISTS 'TEAM'`).catch(e => console.log('TEAM enum:', e.message))

  console.log('Step 2: Creating FolderMember table...')
  await p.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "FolderMember" (
      "id" TEXT NOT NULL,
      "folderId" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "FolderMember_pkey" PRIMARY KEY ("id")
    )
  `).catch(e => console.log('Table:', e.message))

  console.log('Step 3: Creating indexes...')
  await p.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "FolderMember_folderId_userId_key" ON "FolderMember"("folderId", "userId")`).catch(e => console.log('Unique idx:', e.message))
  await p.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "FolderMember_folderId_idx" ON "FolderMember"("folderId")`).catch(e => console.log('Folder idx:', e.message))
  await p.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "FolderMember_userId_idx" ON "FolderMember"("userId")`).catch(e => console.log('User idx:', e.message))

  console.log('Step 4: Adding foreign keys...')
  await p.$executeRawUnsafe(`ALTER TABLE "FolderMember" ADD CONSTRAINT "FolderMember_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder"("id") ON DELETE CASCADE ON UPDATE CASCADE`).catch(e => console.log('FK folder:', e.message))
  await p.$executeRawUnsafe(`ALTER TABLE "FolderMember" ADD CONSTRAINT "FolderMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE`).catch(e => console.log('FK user:', e.message))

  console.log('Migration complete.')
}

main().finally(() => p.$disconnect())
