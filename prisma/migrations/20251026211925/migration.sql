/*
  Warnings:

  - Added the required column `userId` to the `SingleGameMatch` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "SingleGameMatch" ADD COLUMN     "userId" TEXT NOT NULL;

-- AddForeignKey
ALTER TABLE "SingleGameMatch" ADD CONSTRAINT "SingleGameMatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
