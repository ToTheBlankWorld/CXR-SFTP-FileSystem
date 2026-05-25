-- Add TEAM value to FileVisibility enum
ALTER TYPE "FileVisibility" ADD VALUE IF NOT EXISTS 'TEAM';

-- Create FolderMember table
CREATE TABLE "FolderMember" (
    "id" TEXT NOT NULL,
    "folderId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FolderMember_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FolderMember_folderId_userId_key" ON "FolderMember"("folderId", "userId");
CREATE INDEX "FolderMember_folderId_idx" ON "FolderMember"("folderId");
CREATE INDEX "FolderMember_userId_idx" ON "FolderMember"("userId");

ALTER TABLE "FolderMember" ADD CONSTRAINT "FolderMember_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FolderMember" ADD CONSTRAINT "FolderMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
