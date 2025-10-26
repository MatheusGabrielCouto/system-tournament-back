/*
  Warnings:

  - Added the required column `status` to the `SingleGameMatch` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "SingleGameStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'CLOSED');

-- AlterTable
ALTER TABLE "SingleGameMatch" ADD COLUMN     "status" "SingleGameStatus" NOT NULL;
