# Codex Prompts — Event Planning BFF (Go-Forward Pack)

This file contains copy/paste prompts you can use with Codex to keep **implementation, tests, and `docs/api-contract.md`** aligned.

---

## Minimalist v1 contract cleanup pass

Use this when your API works but the contract doc has drift, inconsistent field names, or duplicated/unclear semantics.

```
Perform a minimalist v1 contract cleanup pass.

Goal:
- Make `docs/api-contract.md` exactly match the current WordPress plugin behavior and the Jest contract tests.
- Keep changes minimal and additive-only unless something is clearly wrong or duplicated.
- Do NOT add future endpoints/features.

Tasks:
1) Compare the real API payloads to the examples in `docs/api-contract.md` and update examples to match reality:
   - Field names (prefer snake_case)
   - Route paths and methods
   - Identity inputs (guest email in body vs `guest_email` query for GET snapshot)
   - Error codes + HTTP statuses
2) Add a concise "Frontend Guardrails" section near the top with enforceable rules:
   - Snapshots are canonical server truth
   - After any mutation: replace local state with server response snapshot OR refetch GET snapshot
   - Never compute availability client-side
   - 409/403 responses that include `snapshot` must overwrite stale assumptions
3) Remove duplicated or ambiguous fields in the contract examples if the API already has a canonical representation.
   - Example: if `reason` exists under `availability.reason`, do not also document `slot.reason` unless it truly exists and is intended.
4) Ensure the contract matches current endpoints:
   - POST /signups
   - POST /signups/{id}/cancel
   - GET /events/{id}
5) Update Jest contract tests only if needed to reflect the canonical documented shape.
6) Run tests and ensure all Jest suites pass.

Deliverable:
- A clean `docs/api-contract.md` aligned with code + tests.
- Brief summary of what changed (bullet list).
```

---

## General contract sync

Use after any API-shape change (routes/fields/errors/identity).

```
Update `docs/api-contract.md` to reflect the current implementation.

Requirements:
- Contract-first tone.
- Align endpoint paths, request/response shapes, and error codes with the current WordPress plugin.
- Use actual field names returned by the API (prefer snake_case).
- Remove outdated examples; do not invent future features.
- Preserve overall structure and formatting.

After updating, summarize what changed.
```

---

## Add a new endpoint to the contract

```
Add documentation for the newly implemented endpoint to `docs/api-contract.md`.

Include:
- Route + method
- Request headers + query + body
- Success response example
- Error responses (status codes + error codes)
- Snapshot behavior (if applicable)
- Identity rules (guest vs WP user)

Follow the existing format.
Do not change other endpoints unless they are outdated.
```

---

## Response shape change alignment

Use when you rename/move fields or decide where semantic flags live.

```
Update `docs/api-contract.md` and the Jest contract tests to match the current response structure.

Specifically:
- Ensure the slot object fields match the real snapshot output
- Ensure `availability` and its `reason` placement match implementation
- Ensure `my_signups` shape matches implementation
- Remove fields that are no longer returned or explicitly mark them deprecated

Do not change business behavior unless required for consistency.
Run tests and keep them green.
```

---

## Add Frontend Guardrails section

Use when you want to explicitly lock in your “assume vs ask” discipline.

```
Add a new section titled "Frontend Guardrails" near the top of `docs/api-contract.md`.

This section must be concise and enforceable:
- Snapshots are canonical server truth
- After any mutation: replace local state with server response snapshot OR refetch GET snapshot
- Never compute availability client-side
- Conflicts (409/403 with snapshot) overwrite optimistic assumptions
- React renders meaning; WordPress defines meaning

Keep it under ~12 bullet points.
```

---

## Contract + tests together

Use when you want Codex to treat tests as the enforcement mechanism.

```
If this change affects any endpoint, request shape, response shape, identity rule, or error code:

1) Update `docs/api-contract.md`
2) Update Jest contract tests to match the canonical documented shape
3) Ensure all Jest suites pass

Do not introduce undocumented response fields or error codes.
Summarize updates to contract + tests.
```

---

## Strict contract discipline going forward

Use once to set expectations, then reuse occasionally.

```
Going forward:
- Treat `docs/api-contract.md` as the single source of truth for API behavior.
- Any API-surface change must update the contract doc and the contract tests in the same change.
- Avoid undocumented fields or codes.
- Prefer additive changes; breaking changes require versioning.
```

---

## Quick prompts for common edits

### Remove duplicated fields (example: slot.reason)

```
Remove duplicated semantic fields from the API payload and align the contract + tests.

Example target:
- If `reason` is under `availability.reason`, remove `slot.reason` (or vice versa), and make one canonical location.
- Update `docs/api-contract.md` examples and Jest tests to assert the canonical location.

Run tests and keep them green.
```

### Standardize naming to snake_case

```
Standardize API field names to snake_case across endpoints and snapshot payloads.

- Update implementation
- Update `docs/api-contract.md`
- Update Jest contract tests

Keep the change strictly naming-only (no behavior changes).
```

---

## Notes

- Use these prompts only when relevant:
  - Internal refactors that don’t change API surface do not require contract updates.
- When in doubt, update both:
  - **Code ↔ Contract ↔ Tests**
