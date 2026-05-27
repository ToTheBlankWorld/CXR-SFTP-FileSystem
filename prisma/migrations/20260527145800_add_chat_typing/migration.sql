-- CreateTable
CREATE TABLE "ChatTyping" (
    "id" TEXT NOT NULL,
    "folderId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatTyping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChatTyping_folderId_userId_key" ON "ChatTyping"("folderId", "userId");

-- CreateIndex
CREATE INDEX "ChatTyping_folderId_idx" ON "ChatTyping"("folderId");

-- AddForeignKey
ALTER TABLE "ChatTyping" ADD CONSTRAINT "ChatTyping_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
