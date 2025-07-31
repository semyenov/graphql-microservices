-- Create outbox events table for reliable event publishing
CREATE TABLE IF NOT EXISTS outbox_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL UNIQUE,
    event_type VARCHAR(255) NOT NULL,
    aggregate_id UUID NOT NULL,
    aggregate_type VARCHAR(255) NOT NULL,
    event_data JSONB NOT NULL,
    metadata JSONB NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    retry_count INTEGER NOT NULL DEFAULT 0,
    max_retries INTEGER NOT NULL DEFAULT 5,
    next_retry_at TIMESTAMPTZ,
    last_error TEXT,
    routing_key VARCHAR(255),
    publish_metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT chk_outbox_status CHECK (status IN ('PENDING', 'PROCESSING', 'PUBLISHED', 'FAILED'))
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_outbox_status ON outbox_events (status);
CREATE INDEX IF NOT EXISTS idx_outbox_next_retry ON outbox_events (status, next_retry_at) WHERE status = 'FAILED';
CREATE INDEX IF NOT EXISTS idx_outbox_created_at ON outbox_events (created_at);
CREATE INDEX IF NOT EXISTS idx_outbox_aggregate ON outbox_events (aggregate_type, aggregate_id);
CREATE INDEX IF NOT EXISTS idx_outbox_event_type ON outbox_events (event_type);
CREATE INDEX IF NOT EXISTS idx_outbox_routing_key ON outbox_events (routing_key);

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_outbox_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_outbox_events_updated_at ON outbox_events;
CREATE TRIGGER update_outbox_events_updated_at
    BEFORE UPDATE ON outbox_events
    FOR EACH ROW EXECUTE FUNCTION update_outbox_updated_at();

-- Add comments for documentation
COMMENT ON TABLE outbox_events IS 'Outbox pattern table for reliable event publishing across service boundaries';
COMMENT ON COLUMN outbox_events.id IS 'Unique outbox entry identifier';
COMMENT ON COLUMN outbox_events.event_id IS 'Original domain event ID';
COMMENT ON COLUMN outbox_events.event_type IS 'Type of the domain event';
COMMENT ON COLUMN outbox_events.aggregate_id IS 'ID of the aggregate that generated the event';
COMMENT ON COLUMN outbox_events.aggregate_type IS 'Type of aggregate (e.g., User, Order)';
COMMENT ON COLUMN outbox_events.event_data IS 'Domain event payload as JSON';
COMMENT ON COLUMN outbox_events.metadata IS 'Event metadata (correlation IDs, user info, etc.)';
COMMENT ON COLUMN outbox_events.occurred_at IS 'When the original event occurred';
COMMENT ON COLUMN outbox_events.status IS 'Publishing status: PENDING, PROCESSING, PUBLISHED, FAILED';
COMMENT ON COLUMN outbox_events.retry_count IS 'Number of retry attempts made';
COMMENT ON COLUMN outbox_events.max_retries IS 'Maximum retry attempts allowed';
COMMENT ON COLUMN outbox_events.next_retry_at IS 'When to attempt next retry (for FAILED events)';
COMMENT ON COLUMN outbox_events.last_error IS 'Last error message if publishing failed';
COMMENT ON COLUMN outbox_events.routing_key IS 'Message routing key for event publishing';
COMMENT ON COLUMN outbox_events.publish_metadata IS 'Additional metadata for event publishing';
COMMENT ON COLUMN outbox_events.created_at IS 'When the outbox entry was created';
COMMENT ON COLUMN outbox_events.updated_at IS 'When the outbox entry was last updated';