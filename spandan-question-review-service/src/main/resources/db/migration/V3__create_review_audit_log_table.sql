CREATE TABLE review_audit_log (
    id UUID PRIMARY KEY,
    review_id UUID NOT NULL,
    teacher_id UUID NOT NULL,
    action VARCHAR(20) NOT NULL,
    action_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    details JSONB,
    CONSTRAINT chk_audit_action CHECK (action IN ('APPROVED', 'REJECTED', 'EDITED', 'REORDERED', 'SAVED', 'ORPHANED'))
);

CREATE INDEX idx_review_audit_log_review_id ON review_audit_log(review_id);
