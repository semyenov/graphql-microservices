-- Create snapshots table for event sourcing optimization
CREATE TABLE IF NOT EXISTS snapshots (
    aggregate_id UUID PRIMARY KEY,
    aggregate_type VARCHAR(255) NOT NULL,
    data JSONB NOT NULL,
    version INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_snapshots_aggregate_type ON snapshots (aggregate_type);
CREATE INDEX IF NOT EXISTS idx_snapshots_created_at ON snapshots (created_at);
CREATE INDEX IF NOT EXISTS idx_snapshots_version ON snapshots (aggregate_id, version);

-- Add comments for documentation
COMMENT ON TABLE snapshots IS 'Aggregate snapshots for event sourcing performance optimization';
COMMENT ON COLUMN snapshots.aggregate_id IS 'ID of the aggregate this snapshot represents';
COMMENT ON COLUMN snapshots.aggregate_type IS 'Type of aggregate (e.g., User, Order)';
COMMENT ON COLUMN snapshots.data IS 'Serialized aggregate state as JSON';
COMMENT ON COLUMN snapshots.version IS 'Aggregate version when this snapshot was created';
COMMENT ON COLUMN snapshots.created_at IS 'When the snapshot was created';