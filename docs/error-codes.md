# Error Codes — Event Planning API

This document defines the **canonical error vocabulary** for the Event Planning Backend-for-Frontend (BFF) API.

## Goals
- Provide **stable, symbolic** error codes for frontend logic (no string-matching on messages).
- Ensure conflicts and rule failures return **actionable** information.
- Keep responses consistent across guest + WP-user flows.

## Response Shape (Error)
All non-2xx responses should use this envelope:

```jsonc
{
  "errors": [
    {
      "code": "SLOT_FULL",
      "message": "That slot is no longer available.",
      "details": { },
      "retryable": false
    }
  ],
  "snapshot": {
    // Optional: updated canonical state to re-render UI
  }
}
```

### Field meanings
- **code**: Stable, machine-readable identifier.
- **message**: Human-friendly message safe to show to users.
- **details**: Optional structured data (e.g., field validation errors).
- **retryable**: Whether retrying the same request could reasonably succeed without user changes.
- **snapshot**: Optional canonical state returned by the server (recommended for `409` conflicts).

---

## Status Code Conventions
- **401 Unauthorized**: Missing/invalid session or guest token.
- **403 Forbidden**: Identity is valid, but action is not permitted.
- **404 Not Found**: Resource does not exist or is inaccessible (optional for token privacy).
- **409 Conflict**: Concurrency or rule conflict (capacity/version/race). Should usually include `snapshot`.
- **422 Unprocessable Entity**: Validation errors; includes field-level errors in `details`.
- **429 Too Many Requests**: Rate limit exceeded.
- **500 Internal Server Error**: Unexpected server failure.

---

## Error Code Catalog

> **Rule of thumb:** The frontend renders behavior based on `code`, not message text.

### Authentication & Identity (401)
| Code | Meaning | Frontend action |
|---|---|---|
| AUTH_REQUIRED | No WP session and no guest token present | Prompt login or ask for email/token flow |
| INVALID_SESSION | WP session invalid/expired | Prompt re-login |
| TOKEN_REQUIRED | Guest token missing for token-protected action | Prompt to use magic link |
| TOKEN_INVALID | Token malformed/unknown | Show “link invalid” + request new link |
| TOKEN_EXPIRED | Token expired | Offer “send me a new link” |
| TOKEN_REVOKED | Token revoked by admin/system | Show message + request new link |
| TOKEN_ALREADY_CLAIMED | Token has been claimed by a WP user | Offer login to manage signups |

### Permission & Policy (403)
| Code | Meaning | Frontend action |
|---|---|---|
| NOT_OWNER | Attempt to edit/cancel a signup not owned by current identity | Disable controls + show message |
| ADMIN_ONLY | Admin-only endpoint/action | Hide UI + show insufficient permissions |
| ACTION_NOT_ALLOWED | Action disallowed by policy (generic) | Render server-provided reason and stop |
| EVENT_LOCKED | Event locked by admin | Disable relevant actions |
| SLOT_LOCKED | Slot locked by admin | Disable relevant actions |
| CUTOFF_PASSED | Time cutoff passed | Disable action + show time-related message |
| CLAIM_NOT_ALLOWED | Claiming guest signup not permitted | Show message + stop |

### Not Found / Hidden (404)
| Code | Meaning | Frontend action |
|---|---|---|
| EVENT_NOT_FOUND | Event does not exist | Show 404 screen |
| SLOT_NOT_FOUND | Slot does not exist | Show 404 or fallback |
| SIGNUP_NOT_FOUND | Signup does not exist | Show 404 or “already removed” state |
| RESOURCE_GONE | Resource removed (soft delete) | Show “no longer available” state |

`SIGNUP_NOT_FOUND` is also returned by `POST /signups/{id}/cancel` when the ID is invalid.

### Conflicts & Concurrency (409)
> **409 responses should include a `snapshot`** containing updated availability/capabilities to re-render UI.

| Code | Meaning | snapshot? | Frontend action |
|---|---|---:|---|
| SLOT_FULL | Slot has no remaining capacity | Yes | Update UI with snapshot, prompt user to choose another slot |
| CAPACITY_CHANGED | Capacity/remaining changed since last fetch | Yes | Replace local state with snapshot |
| QTY_EXCEEDS_REMAINING | Requested quantity exceeds remaining | Yes | Show allowed max from snapshot/details |
| DUPLICATE_SIGNUP | Same identity already signed up for this slot | Optional | Show existing signup, navigate to edit |
| VERSION_CONFLICT | Resource version/etag mismatch | Yes | Refetch/replace state and retry if appropriate |
| SIGNUP_ALREADY_CANCELED | Cancel attempted but already canceled | Optional | Treat as success-ish; refresh UI |

`SIGNUP_ALREADY_CANCELED` is emitted by cancellation endpoints so the UI can stop retrying an action that already completed.
| SIGNUP_LOCKED | Signup is locked due to policy/admin | Yes | Disable edit/cancel, render reason |

### Validation (422)
> Include field errors in `details.field_errors`.

| Code | Meaning | Frontend action |
|---|---|---|
| VALIDATION_FAILED | Generic validation failure | Highlight fields using `details.field_errors` |
| INVALID_EMAIL | Email format invalid | Show field error |
| INVALID_QTY | Quantity invalid (<=0 or not allowed) | Show field error |
| QTY_NOT_ALLOWED | Slot does not allow requested qty model | Show explanation + adjust UI |
| NAME_REQUIRED | Guest name required | Show field error |
| EVENT_DATE_INVALID | Invalid event date/time input (admin) | Show field error |
| SLOT_RULE_INVALID | Invalid slot rule configuration (admin) | Show field error |

### Rate Limiting / Abuse (429)
| Code | Meaning | Frontend action |
|---|---|---|
| RATE_LIMITED | Too many requests | Back off, show retry suggestion |
| TOO_MANY_SIGNUP_ATTEMPTS | Excessive attempts for same email/slot | Slow down UI, suggest waiting |
| EMAIL_SEND_LIMIT | Too many magic link/confirmation sends | Suggest waiting before retry |

### Server / Unknown (500)
| Code | Meaning | Frontend action |
|---|---|---|
| INTERNAL_ERROR | Unexpected server error | Show generic error + allow retry |
| EMAIL_SEND_FAILED | Signup succeeded but email failed | Show success + “email may be delayed” and allow resend |
| STORAGE_ERROR | Database/storage failure | Show error + retry later |
| DEPENDENCY_FAILURE | External dependency failure | Show error + retry later |

---

## Recommended `details` Shapes

### Field validation errors (422)
```jsonc
{
  "errors": [
    {
      "code": "VALIDATION_FAILED",
      "message": "Please correct the highlighted fields.",
      "details": {
        "field_errors": {
          "email": "Invalid email address",
          "qty": "Quantity must be between 1 and 3"
        }
      },
      "retryable": false
    }
  ]
}
```

### Conflict with updated snapshot (409)
```jsonc
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
    "event_id": 123,
    "slots": [
      {
        "id": 12,
        "remaining": 0,
        "can_signup": false,
        "reason": "slot_full"
      }
    ]
  }
}
```

---

## Versioning Note
If you ever change meanings/behavior of an existing `code`, **add a new code** instead. Codes should be stable over time.
