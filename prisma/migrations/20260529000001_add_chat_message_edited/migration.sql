-- Add editedAt column to track edited chat messages
ALTER TABLE "ChatMessage" ADD COLUMN "editedAt" TIMESTAMP(3);
