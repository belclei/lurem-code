-- CreateEnum
CREATE TYPE "CalendarEntryDisplayStyle" AS ENUM ('box', 'inline');

-- CreateTable
CREATE TABLE "GlobalCalendarEntry" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "day" INTEGER NOT NULL,
    "displayStyle" "CalendarEntryDisplayStyle" NOT NULL DEFAULT 'inline',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GlobalCalendarEntry_pkey" PRIMARY KEY ("id")
);
