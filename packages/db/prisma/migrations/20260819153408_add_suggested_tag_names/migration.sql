-- AlterTable
ALTER TABLE "ExtractedTransaction" ADD COLUMN     "suggestedTagNames" TEXT[] DEFAULT ARRAY[]::TEXT[];
