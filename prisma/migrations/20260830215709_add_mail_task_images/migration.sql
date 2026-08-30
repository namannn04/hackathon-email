-- CreateTable
CREATE TABLE "MailTaskImage" (
    "id" TEXT NOT NULL,
    "mailTaskId" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "dataBase64" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MailTaskImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MailTaskImage_mailTaskId_position_idx" ON "MailTaskImage"("mailTaskId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "MailTaskImage_mailTaskId_contentId_key" ON "MailTaskImage"("mailTaskId", "contentId");

-- AddForeignKey
ALTER TABLE "MailTaskImage" ADD CONSTRAINT "MailTaskImage_mailTaskId_fkey" FOREIGN KEY ("mailTaskId") REFERENCES "MailTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
