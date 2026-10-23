-- CreateTable
CREATE TABLE "cycle_sessions" (
    "cycle_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "academy_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cycle_sessions_pkey" PRIMARY KEY ("cycle_id","session_id")
);

-- CreateIndex
CREATE INDEX "cycle_sessions_session_id_idx" ON "cycle_sessions"("session_id");

-- AddForeignKey
ALTER TABLE "cycle_sessions" ADD CONSTRAINT "cycle_sessions_academy_id_fkey" FOREIGN KEY ("academy_id") REFERENCES "academies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cycle_sessions" ADD CONSTRAINT "cycle_sessions_cycle_id_academy_id_fkey" FOREIGN KEY ("cycle_id", "academy_id") REFERENCES "payment_cycles"("id", "academy_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cycle_sessions" ADD CONSTRAINT "cycle_sessions_session_id_academy_id_fkey" FOREIGN KEY ("session_id", "academy_id") REFERENCES "sessions"("id", "academy_id") ON DELETE RESTRICT ON UPDATE CASCADE;
