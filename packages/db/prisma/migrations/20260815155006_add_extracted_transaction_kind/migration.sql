-- AlterTable
ALTER TABLE "ExtractedTransaction" ADD COLUMN     "kind" "TxKind" NOT NULL DEFAULT 'expense';
