-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN     "autoAdvance" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "currentRound" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "nextRoundAt" TIMESTAMP(3),
ADD COLUMN     "totalRounds" INTEGER;
