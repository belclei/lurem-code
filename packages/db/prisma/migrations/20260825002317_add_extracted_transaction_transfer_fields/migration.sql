-- AlterTable
ALTER TABLE "ExtractedTransaction" ADD COLUMN     "suggestedCounterpartAccountId" TEXT,
ADD COLUMN     "transferDirection" "TxDirection";
