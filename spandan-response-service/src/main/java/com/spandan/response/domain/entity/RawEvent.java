package com.spandan.response.domain.entity;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "raw_events")
public class RawEvent {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "event_id", nullable = false, unique = true)
    private UUID eventId;

    @Column(name = "event_type", nullable = false, length = 20)
    private String eventType;

    @Column(name = "event_payload", nullable = false, columnDefinition = "JSONB")
    private String eventPayload;

    @Column(name = "consumed_at", nullable = false, updatable = false)
    private Instant consumedAt;

    @PrePersist
    protected void onCreate() { consumedAt = Instant.now(); }

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public UUID getEventId() { return eventId; }
    public void setEventId(UUID eventId) { this.eventId = eventId; }
    public String getEventType() { return eventType; }
    public void setEventType(String eventType) { this.eventType = eventType; }
    public String getEventPayload() { return eventPayload; }
    public void setEventPayload(String eventPayload) { this.eventPayload = eventPayload; }
    public Instant getConsumedAt() { return consumedAt; }
    public void setConsumedAt(Instant consumedAt) { this.consumedAt = consumedAt; }
}
