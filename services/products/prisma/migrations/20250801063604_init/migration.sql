-- CreateTable
CREATE TABLE "public"."events" (
    "id" TEXT NOT NULL,
    "aggregate_id" TEXT NOT NULL,
    "aggregate_type" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "metadata" JSONB NOT NULL,
    "stream_position" INTEGER NOT NULL,
    "global_position" BIGSERIAL NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."snapshots" (
    "id" TEXT NOT NULL,
    "aggregate_id" TEXT NOT NULL,
    "aggregate_type" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "version" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."outbox_events" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "aggregate_id" TEXT NOT NULL,
    "aggregate_type" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "event_data" JSONB NOT NULL,
    "event_metadata" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "max_retries" INTEGER NOT NULL DEFAULT 3,
    "routing_key" TEXT,
    "publish_metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "next_retry_at" TIMESTAMP(3),
    "last_error" TEXT,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "events_aggregate_id_idx" ON "public"."events"("aggregate_id");

-- CreateIndex
CREATE INDEX "events_aggregate_type_idx" ON "public"."events"("aggregate_type");

-- CreateIndex
CREATE INDEX "events_type_idx" ON "public"."events"("type");

-- CreateIndex
CREATE INDEX "events_occurred_at_idx" ON "public"."events"("occurred_at");

-- CreateIndex
CREATE INDEX "events_global_position_idx" ON "public"."events"("global_position");

-- CreateIndex
CREATE UNIQUE INDEX "events_aggregate_id_stream_position_key" ON "public"."events"("aggregate_id", "stream_position");

-- CreateIndex
CREATE UNIQUE INDEX "events_id_key" ON "public"."events"("id");

-- CreateIndex
CREATE INDEX "snapshots_aggregate_type_idx" ON "public"."snapshots"("aggregate_type");

-- CreateIndex
CREATE UNIQUE INDEX "snapshots_aggregate_id_version_key" ON "public"."snapshots"("aggregate_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "outbox_events_event_id_key" ON "public"."outbox_events"("event_id");

-- CreateIndex
CREATE INDEX "outbox_events_status_idx" ON "public"."outbox_events"("status");

-- CreateIndex
CREATE INDEX "outbox_events_created_at_idx" ON "public"."outbox_events"("created_at");

-- CreateIndex
CREATE INDEX "outbox_events_aggregate_type_aggregate_id_idx" ON "public"."outbox_events"("aggregate_type", "aggregate_id");
