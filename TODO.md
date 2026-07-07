# ADMIN Role — Platform-Wide Integration

## Completed
- [x] Auth service `context.md` — revised with ADMIN role (enum, JWT claims, DB constraint, provisioning endpoints, tests)

## Remaining Gaps

### Service Contexts (need ADMIN role documentation)
- [ ] `spandan-api-gateway/context.md` — needs route authorization table updated for ADMIN (reviews→ADMIN, polls lifecycle→ADMIN, responses→{STUDENT,ADMIN}, questions→TEACHER only)
- [ ] `spandan-question-generation-service/context.md` — confirm TEACHER-only for generation; document ADMIN exclusion
- [ ] `spandan-question-review-service/context.md` — update authorization from TEACHER to ADMIN
- [ ] `spandan-polling-service/context.md` — update lifecycle endpoints (start/pause/resume/end/cancel) from TEACHER to ADMIN
- [ ] `spandan-notification-service/context.md` — document ADMIN as an authenticated role
- [ ] `spandan-analytics-service/context.md` — confirm TEACHER-only for analytics
- [ ] `spandan-response-service/context.md` — refine from {STUDENT,TEACHER} to {STUDENT,ADMIN}
- [ ] `spandan-reporting-service/context.md` — confirm ADMIN access to reports
- [ ] Remaining services (transcription, recording, RTC) — document ADMIN alongside TEACHER where applicable

### Cross-Cutting Documents
- [ ] `architectural-analysis.md` — update Security Model (Deliverable 19) from "TEACHER, STUDENT" to "ADMIN, TEACHER, STUDENT"
- [ ] `events.md` — no ADMIN-specific events needed (auth-service `user-events` already carry `role`)
- [ ] `spandan-api-gateway/context-admin-role.md` — was deleted; gateway route authorization spec needs to be incorporated into main `context.md`

### Implementation
- [ ] Auth service code — `Role.java`, DB migration `V3__add_admin_role_to_users_check.sql`, admin endpoints, tests
- [ ] API Gateway — JWT role recognition for ADMIN, route authorization sets, `role` metric tag
- [ ] Downstream services — role branching on `role` claim for ADMIN-accessible routes
