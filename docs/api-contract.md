# API Contract — Event Planning (BFF)

This document defines the **Backend-for-Frontend (BFF) API contract** between the WordPress plugin (Source of Truth) and the React frontend.

This is a **contract-first document**. Implementation must conform to these shapes and rules.

---

## Core Principles

- WordPress is the **Source of Truth (SoT)** for all business decisions.
- React renders server-defined meaning and capabilities.
- All mutations return **canonical snapshots**.
- Conflicts are expected and explicitly handled.

---

## Endpoint: Create Signup

### `POST /signups`

Create a signup for a slot.  
Supports both **guest users** and **authenticated WordPress users**.

---

## Request

### Headers
- `Content-Type: application/json`
- Auth context:
  - WP user: cookie-based session
  - Guest: no auth header; identity provided in body

### Body

```json
{
  "slot_id": 12,
  "qty": 2,
  "guest": {
    "email": "user@example.com",
    "name": "Jane Doe"
  }
}
```

#### Field Rules
- `slot_id` (required): must reference an existing slot
- `qty` (required): must be > 0 and within slot rules
- `guest`:
  - required if no WP session exists
  - ignored if WP user is authenticated

---

## Success Response

### `200 OK`

```json
{
  "data": {
    "signup": {
      "id": 77,
      "slot_id": 12,
      "qty": 2,
      "identity_type": "guest",
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

### Notes
- The signup is fully committed when this response is returned.
- Email sending (confirmation / magic link) happens **after commit**.
- React must replace local state with returned availability.

---

## Conflict Response

### `409 Conflict`

Returned when availability or rules changed between view and commit.

```json
{
  "errors": [
    {
      "code": "SLOT_FULL",
      "message": "That slot is no longer available.",
      "details": {},
      "retryable": false
    }
  ],
  "snapshot": {
    "availability": {
      "slot_id": 12,
      "remaining": 0,
      "can_signup": false,
      "reason": "slot_full"
    }
  }
}
```

### Rules
- `409` responses **must** include a snapshot.
- React must discard optimistic state and re-render using snapshot.
- React must not retry automatically unless `retryable === true`.

---

## Validation Errors

### `422 Unprocessable Entity`

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

### Rules
- No snapshot required.
- React highlights fields and blocks submission.

---

## Authentication Errors

### `401 Unauthorized`

```json
{
  "errors": [
    {
      "code": "AUTH_REQUIRED",
      "message": "Authentication is required.",
      "details": {},
      "retryable": false
    }
  ]
}
```

---

## Permission Errors

### `403 Forbidden`

```json
{
  "errors": [
    {
      "code": "CUTOFF_PASSED",
      "message": "Signups are closed for this slot.",
      "details": {},
      "retryable": false
    }
  ],
  "snapshot": {
    "availability": {
      "slot_id": 12,
      "remaining": 2,
      "can_signup": false,
      "reason": "cutoff_passed"
    }
  }
}
```

---

## Canonical Snapshot Rules

- A snapshot represents **current truth**, not deltas.
- React must never compute availability from raw counts.
- Snapshots replace all local assumptions.

---

## Idempotency & Safety

- Duplicate signup attempts for the same identity + slot may return:
  - `409 DUPLICATE_SIGNUP`, or
  - `200 OK` with the existing signup
- The backend decides which behavior applies.

---

## Versioning

This contract is **v1 by convention**.
Breaking changes require:
- new endpoint, or
- versioned route, or
- additive-only changes

---

## Summary

> **React requests actions. WordPress decides outcomes.  
> All outcomes are communicated via canonical snapshots.**
