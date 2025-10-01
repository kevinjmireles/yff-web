# Delegation Token Service — Acceptance Criteria (v0.1)

## Functional
- [ ] Resolves `{{fido.delegation}}` to 2 senators + 1 representative for any valid US OCD ID or ZIP.
- [ ] Supports `output` = `html` and `text` with identical content semantics.
- [ ] Honors options: `format`, `style`, `include_contacts`, `fallback`, `locale` (default values applied when absent).
- [ ] Batch endpoint returns per-row statuses with `external_id` passthrough.
- [ ] Returns `fallback` when no geo match; otherwise returns `RECIPIENT_NOT_FOUND` with 400.
- [ ] Caches results for 24h; returns `ETag` and `Cache-Control: max-age=86400`.
- [ ] Enforces Bearer API keys per publisher.

## Non-Functional
- [ ] P50 latency: single resolve ≤ 200 ms with warm cache; batch 1,000 rows ≤ 2 s.
- [ ] Rate limit: single = 60/min; batch = 600/min per publisher.
- [ ] Observability: structured logs include publisher_id, endpoint, duration, status.
- [ ] TDD: unit tests cover parsing, geo resolution, rendering; integration tests cover 200/400/401/429.

## Security & Privacy
- [ ] API keys are hashed at rest; rotations supported.
- [ ] No PII stored in logs; only counts and stable IDs.
- [ ] Optional hash-only recipient mode gated behind feature flag.

## Rollout
- [ ] M1 (single resolve) live behind `FEATURE_FIDO_TOKENS` flag.
- [ ] M2 (batch) enabled after load test passes.
- [ ] M3 (template render) remains disabled by default until 3 pilots complete.
