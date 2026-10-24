-- CreateEnum
CREATE TYPE "payment_method" AS ENUM ('cash', 'transfer', 'wallet');

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "academy_id" UUID NOT NULL,
    "cycle_id" UUID NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "paid_on" DATE NOT NULL,
    "method" "payment_method" NOT NULL,
    "note" TEXT,
    "recorded_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payments_cycle_id_key" ON "payments"("cycle_id");

-- CreateIndex
CREATE INDEX "payments_paid_on_idx" ON "payments"("paid_on");

-- CreateIndex
CREATE UNIQUE INDEX "payments_id_academy_id_key" ON "payments"("id", "academy_id");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_academy_id_fkey" FOREIGN KEY ("academy_id") REFERENCES "academies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_cycle_id_academy_id_fkey" FOREIGN KEY ("cycle_id", "academy_id") REFERENCES "payment_cycles"("id", "academy_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_recorded_by_academy_id_fkey" FOREIGN KEY ("recorded_by", "academy_id") REFERENCES "users"("id", "academy_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Custom SQL: check constraints, which Prisma cannot express (ADR-0002).
-- A payment is an amount above 0 (the service also requires it to equal the plan's, BR-09).
ALTER TABLE "payments" ADD CONSTRAINT "payments_amount_check" CHECK ("amount" > 0);

-- A note is stored trimmed, and a blank one is stored as null.
ALTER TABLE "payments" ADD CONSTRAINT "payments_note_check"
  CHECK ("note" IS NULL OR ("note" = btrim("note") AND btrim("note") <> ''));
