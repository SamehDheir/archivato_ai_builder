-- CreateTable
CREATE TABLE "device_registrations" (
    "id" TEXT NOT NULL,
    "fingerprintHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_registrations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "device_registrations_fingerprintHash_key" ON "device_registrations"("fingerprintHash");

-- CreateIndex
CREATE INDEX "device_registrations_userId_idx" ON "device_registrations"("userId");

-- AddForeignKey
ALTER TABLE "device_registrations" ADD CONSTRAINT "device_registrations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
