/*
  Warnings:

  - A unique constraint covering the columns `[userId,tournamentId]` on the table `Standing` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Standing_userId_tournamentId_key" ON "Standing"("userId", "tournamentId");
