-- CreateTable
CREATE TABLE "projection_checkpoint" (
    "projection_name" TEXT NOT NULL,
    "position" TEXT NOT NULL DEFAULT '0',
    "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "event_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "projection_checkpoint_pkey" PRIMARY KEY ("projection_name")
);

-- CreateIndex
CREATE INDEX "projection_checkpoint_position_idx" ON "projection_checkpoint"("position");
CREATE INDEX "projection_checkpoint_processed_at_idx" ON "projection_checkpoint"("processed_at");