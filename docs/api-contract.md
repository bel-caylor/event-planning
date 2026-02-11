# API Contract — Event Planning (BFF)

This document captures the **Backend-for-Frontend (BFF) contract** that the WordPress plugin exposes to the React experience. WordPress owns every decision, and React renders the truth the server returns.

---

## Core Principles

- WordPress is the **source of truth** for slots, signups, and permissions.
- Mutations return **canonical snapshots** describing the slot state *after* the change.
- Availability is *never* re-computed on the client; it is derived entirely from server snapshots.
- Conflicts, duplicate attempts, and stale data are surfaced through explicit error codes plus snapshot payloads.

---

## Frontend Guardrails

- Treat every `snapshot` payload as authoritative. Replace local slot state with the returned snapshot or re-fetch `GET /events/{id}`.
- After any mutation, the response’s `availability` (or the entire snapshot) is the only truth React should render; do not merge optimistic mutations manually.
- Never compute remaining seats, cutoff status, or `can_signup` on the client—use the returned fields instead.
- Any `403` or `409` response that carries a `snapshot` must overwrite stale assumptions before the UI retries or re-enables controls.
- Respect server-provided capability flags (`can_signup`, `can_cancel`, `can_edit`, `can_claim`) instead of inferring rules client-side.

---

## Endpoint: Create Signup

### `POST /wp-json/event-planning/v1/signups`

Creates a signup for the requested slot. Supports both guests and authenticated WordPress users.

### Request

#### Headers
- `Content-Type: application/json`
- Auth context:
  - WP user: cookie-backed session
  - Guest: no WP auth header; supply the identity in the body

#### Body

```json
{
  "slot_id": 12,
  "qty": 2,
  "guest": {
    "email": "guest@example.com",
    "name": "Guest User"
  }
}
```

`guest` is required only when no authenticated WP user is present.

### Success Response

#### `200 OK`

```json
{
  "data": {
    "signup": {
      "id": "uuid-abc-123",
      "slot_id": 12,
      "identity_type": "guest",
      "identity_key": "guest:guest@example.com",
      "qty": 2,
      "status": "confirmed",
      "can_edit": true,
      "can_cancel": true,
      "can_claim": true
    },
    "availability": {
      "slot_id": 12,
      "remaining": 3,
      "can_signup": true,
      "reason": null
    }
  },
  "errors": []
}
```

`identity_type` is either `guest` or `wp_user`; `identity_key` mirrors the identity you supplied.

### Common Errors

- **`403 ACTION_NOT_ALLOWED`** — The slot is locked. React must surface the snapshot’s availability with `reason: "slot_locked"` and prevent new attempts.
- **`403 CUTOFF_PASSED`** — Cutoff time has already passed. Snapshot includes `reason: "cutoff_passed"`.
- **`409 SLOT_FULL`** — Remaining space is insufficient. Snapshot holds the updated remaining seats (`reason: "slot_full"`).
- **`422 VALIDATION_FAILED`** — Missing or invalid `slot_id`, `qty`, or required `guest` fields.
- **`409` or `200` for duplicates** — If a confirmed signup already exists for the same identity + slot, the server may return `200 OK` with the existing signup *or* `409` with a snapshot; always render whatever snapshot arrives.

Every error response that returns `snapshot` **must** be treated as the new canonical state.

---

## Endpoint: Cancel Signup

### `POST /wp-json/event-planning/v1/signups/{signup_id}/cancel`

Cancels a confirmed signup, restores availability, and retires the signup’s edit/cancel rights.

### Request

#### Headers
- `Content-Type: application/json`
- `x-wp-user-id` is auto-populated for authenticated WordPress users.

#### Body

```json
{
  "guest": {
    "email": "guest@example.com"
  }
}
```

`guest.email` is required for unauthenticated requests.

### Success Response

#### `200 OK`

```json
{
  "data": {
    "signup": {
      "id": "uuid-abc-123",
      "slot_id": 12,
      "identity_type": "guest",
      "identity_key": "guest:guest@example.com",
      "qty": 2,
      "status": "canceled",
      "can_edit": false,
      "can_cancel": false,
      "can_claim": false
    },
    "availability": {
      "slot_id": 12,
      "remaining": 5,
      "can_signup": true,
      "reason": null
    }
  },
  "errors": []
}
```

React must treat the returned availability snapshot as the single source of truth and refresh slot state accordingly.

### Error Responses

- **`404 SIGNUP_NOT_FOUND`** — Signup either never existed or was already deleted. Do not retry.
- **`403 NOT_OWNER`** — Supplied identity does not match the signup’s owner. Disable cancel controls.
- **`409 SIGNUP_ALREADY_CANCELED`** — Signup has already been canceled. Snapshot lets the UI refresh.

All listed errors above provide a `snapshot`.

---

## Endpoint: Event Snapshot

### `GET /wp-json/event-planning/v1/events/{id}`

Returns the full event, every slot with canonical availability, and the `my_signups` slice for the requesting identity.

### Request

#### Headers
- Server handles `x-wp-user-id` automatically when the request originates from WP.

#### Query
- `guest_email` — required for guests so the server can resolve identity. Ignored for WP-authenticated requests.

### Success Response

#### `200 OK`

```json
{
  "data": {
    "event": {
      "id": 1,
      "title": "Event Planning Demo",
      "description": "",
      "starts_at": "2026-02-11 12:00:00",
      "ends_at": null,
      "status": "draft",
      "created_at": "2026-02-11 12:00:00",
      "updated_at": "2026-02-11 12:00:00",
      "slots": [
        {
          "slot_id": 12,
          "event_id": 1,
          "capacity": 10,
          "remaining": 5,
          "max_qty": 3,
          "cutoff_at": null,
          "locked": false,
          "availability": {
            "slot_id": 12,
            "remaining": 5,
            "can_signup": true,
            "reason": null
          },
          "can_signup": true,
          "can_cancel": true,
          "can_edit": true,
          "can_claim": true,
          "reason": null
        }
      ]
    },
    "my_signups": []
  },
  "errors": []
}
```

- Each slot entry mirrors the slot table plus a canonical `availability` block.
- `my_signups` lists the confirmed or canceled signups for the current identity:
  - Fields: `id`, `slot_id`, `identity_type`, `identity_key`, `qty`, `status`, `can_edit`, `can_cancel`, `can_claim`, `created_at`, `updated_at`.
- Guests should supply `guest_email` so the response can include their `my_signups`; otherwise `my_signups` stays empty.

### Errors

- **`404 EVENT_NOT_FOUND`** — Event ID does not exist.

---

## Conflict & Snapshot Rules

- `403` and `409` responses that return a `snapshot` always describe the **current** availability for the slot. Overwrite local state before re-enabling controls.
- `snapshot.availability.reason` can be `slot_full`, `slot_locked`, `cutoff_passed`, or `signup_already_canceled` depending on the failure.
- If a client sees `retryable: true`, it may re-submit after refreshing the snapshot; otherwise, treat the error as final.
- Never emit availability-related UI (remaining seats, CTA visibility) without the latest snapshot.

---

## Validation Errors

### `422 VALIDATION_FAILED`

```json
{
  "errors": [
    {
      "code": "VALIDATION_FAILED",
      "message": "Please correct the highlighted fields.",
      "details": {
        "field_errors": {
          "qty": "Quantity exceeds allowed maximum"
        }
      },
      "retryable": false
    }
  ]
}
```

Used when `slot_id`, `qty`, or `guest` input is missing or invalid.

---

## Versioning

This is the **v1 contract by convention**. Breaking changes require introducing a new route, versioned namespace, or additive extension.

--- 

## Summary

React requests actions. WordPress decides outcomes. All outcomes come with canonical snapshots so the UI always renders the truth.
