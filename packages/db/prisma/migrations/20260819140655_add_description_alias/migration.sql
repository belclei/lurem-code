-- AlterTable
ALTER TABLE "ExtractedTransaction" ADD COLUMN     "originalDescription" TEXT;

-- CreateTable
CREATE TABLE "DescriptionAlias" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rawDescription" TEXT NOT NULL,
    "friendlyName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DescriptionAlias_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DescriptionAlias_userId_idx" ON "DescriptionAlias"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "DescriptionAlias_userId_rawDescription_key" ON "DescriptionAlias"("userId", "rawDescription");
