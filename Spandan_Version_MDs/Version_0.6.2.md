# v0.6.2 — Multiple Interchangeable Model Providers

| Field | Value |
|---|---|
| Version | 0.6.2 |
| Group | 0.6 — AI Question Generation |
| Status | Released |
| Goal | Let the same generation capability run against any of several interchangeable model providers, chosen per request, with a discoverable list of which providers are available. |

## References & prerequisites
Assumes these earlier chunks are already built:
- **0.1** — application skeleton and configuration loading.
- **0.2** — identity & access foundation: Teacher/Student/Admin roles, role-based authorization, and the reusable **approved-teacher** guard.
- **0.3.x** — rooms owned by teachers.
- **0.6.1** — question generation from a transcript against a single provider, producing structured questions with options and a marked correct answer.

External references the implementing agent should consult: the request/response conventions of each model provider it chooses to support (for example MiniMax, OpenAI, Anthropic/Claude, and Google/Gemini).

## Purpose
Avoid being locked to one model vendor. The generation capability from 0.6.1 should work identically whichever provider is chosen, so a teacher can pick a provider per request and an operator can turn providers on or off through configuration alone, without touching the generation logic or the calling surface.

## Functional requirements
1. **Interchangeable providers** — the transcript-to-questions capability from 0.6.1 can run against any of several supported providers. The choice of provider changes only where the text comes from; the shaping options (count, difficulty, type mix) and the structured output shape are identical across providers.
2. **Per-request selection** — the requesting teacher names which provider to use for that generation. When none is named, a sensible default provider is used.
3. **Availability from configuration** — a provider is considered enabled only when its credential is present in server configuration; a provider with no credential is treated as unavailable.
4. **Discoverable provider list** — any authenticated user can retrieve the list of supported providers, each with a display name, a display marker, and whether it is currently enabled, so a client can offer only usable choices.
5. **Guarded selection** — a request naming an unknown provider, or one that is not enabled, is refused with a clear message rather than silently falling back.
6. **Uniform result handling** — each provider's raw output is normalized into the same structured question shape, and the same "empty / malformed / no usable questions" failure handling from 0.6.1 applies regardless of which provider was used.

## Data handled
- **Input:** the same transcript and shaping options as 0.6.1, plus a chosen provider identifier.
- **Output:** the same structured questions as 0.6.1, independent of provider.
- **Provider directory:** for each supported provider, a stable identifier, a display name, a display marker, and an enabled flag.

## Security requirements
- Generation still requires an **approved teacher** (the 0.2 guard).
- Retrieving the provider list requires an authenticated user, but reveals only names and enabled flags — never the underlying credentials, which remain server-side only.

## Performance & scaling requirements
- Adding or removing a provider is a configuration change; it must not require reworking the generation path or the calling surface.
- A failure isolated to one provider must not disable the others; another provider remains selectable.

## Configuration
- A credential (and, where needed, endpoint/model selection) per supported provider.
- The default provider to use when a request names none.
- A provider's enabled state derives from whether its credential is configured.

## Acceptance criteria
1. The provider-list request returns every supported provider with its display name and an accurate enabled flag reflecting which credentials are configured.
2. The same transcript generated against two different enabled providers yields the same structured shape (type, text, options, marked correct answer).
3. Selecting an enabled provider succeeds; selecting an unknown or unconfigured provider is refused with a clear message.
4. Omitting a provider uses the configured default.
5. A provider whose credential is removed reports as disabled and can no longer be selected, while the others still work.

## Out of scope (built elsewhere)
- Running generation in the background off the request path — **0.6.3**.
- Generating from arbitrary pasted text — **0.6.4**.
- Teacher review, edit, and approval before launch — **0.6.5**.
