# ADMIN Role — Platform-Wide Integration

## Completed
- [x] Auth service `context.md` — revised with ADMIN role (enum, JWT claims, DB constraint, provisioning endpoints, tests)

## Remaining Gaps

### Service Contexts (need ADMIN role documentation)
- [ ] `spandan-api-gateway/context.md` — needs route authorization table updated for ADMIN (reviews→ADMIN, polls lifecycle→ADMIN, responses→{STUDENT,ADMIN}, questions→TEACHER only)
- [x] `spandan-question-generation-service/context.md` — confirmed TEACHER-only; documented ADMIN exclusion
- [x] `spandan-question-review-service/context.md` — updated authorization from TEACHER to ADMIN
- [x] `spandan-polling-service/context.md` — updated lifecycle endpoints from TEACHER to ADMIN
- [x] `spandan-notification-service/context.md` — documented ADMIN as an authenticated role
- [x] `spandan-analytics-service/context.md` — added ADMIN for cross-class analytics
- [x] `spandan-response-service/context.md` — refined from {STUDENT,TEACHER} to {STUDENT,TEACHER,ADMIN}
- [x] `spandan-reporting-service/context.md` — confirmed ADMIN access to reports
- [x] Remaining services (transcription, recording, RTC) — documented ADMIN alongside TEACHER

### Cross-Cutting Documents
- [x] `architectural-analysis.md` — updated Security Model (Deliverable 19) from "TEACHER, STUDENT" to "ADMIN, TEACHER, STUDENT"
- [ ] `events.md` — no ADMIN-specific events needed (auth-service `user-events` already carry `role`)  [defer: low priority, no new events needed]
- [x] `spandan-api-gateway/context-admin-role.md` — was deleted; gateway route authorization spec already incorporated into main `context.md`

### Implementation
- [ ] Auth service code — `Role.java`, DB migration `V3__add_admin_role_to_users_check.sql`, admin endpoints, tests
- [ ] API Gateway — JWT role recognition for ADMIN, route authorization sets, `role` metric tag
- [ ] Downstream services — role branching on `role` claim for ADMIN-accessible routes
