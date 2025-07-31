-- Create events table for event sourcing
CREATE TABLE IF NOT EXISTS events (
    global_position BIGSERIAL PRIMARY KEY,
    id UUID NOT NULL UNIQUE,
    type VARCHAR(255) NOT NULL,
    aggregate_id UUID NOT NULL,
    aggregate_type VARCHAR(255) NOT NULL,
    stream_position INTEGER NOT NULL,
    data JSONB NOT NULL,
    metadata JSONB NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL,
    stored_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    version INTEGER NOT NULL,
    
    UNIQUE(aggregate_id, stream_position)
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_events_aggregate_id ON events (aggregate_id);
CREATE INDEX IF NOT EXISTS idx_events_aggregate_type ON events (aggregate_type);
CREATE INDEX IF NOT EXISTS idx_events_type ON events (type);
CREATE INDEX IF NOT EXISTS idx_events_occurred_at ON events (occurred_at);
CREATE INDEX IF NOT EXISTS idx_events_global_position ON events (global_position);
CREATE INDEX IF NOT EXISTS idx_events_stream_position ON events (aggregate_id, stream_position);

-- Add comments for documentation
COMMENT ON TABLE events IS 'Event store for domain events in event sourcing architecture';
COMMENT ON COLUMN events.global_position IS 'Global ordering position across all events';
COMMENT ON COLUMN events.id IS 'Unique event identifier';
COMMENT ON COLUMN events.type IS 'Event type (e.g., UserCreated, OrderShipped)';
COMMENT ON COLUMN events.aggregate_id IS 'ID of the aggregate this event belongs to';
COMMENT ON COLUMN events.aggregate_type IS 'Type of aggregate (e.g., User, Order)';
COMMENT ON COLUMN events.stream_position IS 'Position within the aggregate event stream';
COMMENT ON COLUMN events.data IS 'Event payload as JSON';
COMMENT ON COLUMN events.metadata IS 'Event metadata (correlation IDs, user info, etc.)';
COMMENT ON COLUMN events.occurred_at IS 'When the event actually occurred';
COMMENT ON COLUMN events.stored_at IS 'When the event was stored in the database';
COMMENT ON COLUMN events.version IS 'Aggregate version when this event was created';