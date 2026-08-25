-- AddForeignKey
ALTER TABLE "ExtractedTransaction" ADD CONSTRAINT "ExtractedTransaction_suggestedCounterpartAccountId_fkey" FOREIGN KEY ("suggestedCounterpartAccountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
