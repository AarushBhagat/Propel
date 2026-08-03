-- CreateTable
CREATE TABLE "Feeder" (
    "id" TEXT NOT NULL,

    CONSTRAINT "Feeder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transformer" (
    "id" TEXT NOT NULL,
    "feederId" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lon" DOUBLE PRECISION NOT NULL,
    "capacityKva" INTEGER NOT NULL,
    "householdsServed" INTEGER NOT NULL,

    CONSTRAINT "Transformer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pole" (
    "id" TEXT NOT NULL,
    "feederId" TEXT NOT NULL,
    "dtId" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lon" DOUBLE PRECISION NOT NULL,
    "seqOnLine" INTEGER,
    "parentPoleId" TEXT,
    "poleType" TEXT NOT NULL,
    "ward" TEXT NOT NULL,
    "pincode" TEXT,
    "deviceId" TEXT,

    CONSTRAINT "Pole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Telemetry" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "poleId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "energized" BOOLEAN NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL,
    "seq" INTEGER NOT NULL,
    "batteryMv" INTEGER,
    "rssi" INTEGER,
    "fw" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Telemetry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Incident" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "inferredSpan" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL,
    "downstreamImpact" INTEGER NOT NULL,
    "overlapOutage" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "Incident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncidentPole" (
    "incidentId" TEXT NOT NULL,
    "poleId" TEXT NOT NULL,

    CONSTRAINT "IncidentPole_pkey" PRIMARY KEY ("incidentId","poleId")
);

-- CreateTable
CREATE TABLE "Ticket" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduledOutage" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "feederId" TEXT,
    "transformerId" TEXT,
    "start" TIMESTAMP(3) NOT NULL,
    "end" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,

    CONSTRAINT "ScheduledOutage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Pole_deviceId_key" ON "Pole"("deviceId");

-- CreateIndex
CREATE INDEX "Telemetry_deviceId_seq_idx" ON "Telemetry"("deviceId", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_incidentId_key" ON "Ticket"("incidentId");

-- AddForeignKey
ALTER TABLE "Transformer" ADD CONSTRAINT "Transformer_feederId_fkey" FOREIGN KEY ("feederId") REFERENCES "Feeder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pole" ADD CONSTRAINT "Pole_dtId_fkey" FOREIGN KEY ("dtId") REFERENCES "Transformer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pole" ADD CONSTRAINT "Pole_parentPoleId_fkey" FOREIGN KEY ("parentPoleId") REFERENCES "Pole"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Telemetry" ADD CONSTRAINT "Telemetry_poleId_fkey" FOREIGN KEY ("poleId") REFERENCES "Pole"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentPole" ADD CONSTRAINT "IncidentPole_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentPole" ADD CONSTRAINT "IncidentPole_poleId_fkey" FOREIGN KEY ("poleId") REFERENCES "Pole"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledOutage" ADD CONSTRAINT "ScheduledOutage_feederId_fkey" FOREIGN KEY ("feederId") REFERENCES "Feeder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledOutage" ADD CONSTRAINT "ScheduledOutage_transformerId_fkey" FOREIGN KEY ("transformerId") REFERENCES "Transformer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
