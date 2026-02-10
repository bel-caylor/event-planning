# Prototype Server

This repository now contains a small Express-based BFF that proves the contracts laid out in `docs/api-contract.md`.

## Source
- `src/server.js` implements the `POST /signups` flow with validation, conflict snapshots, and the canonical availability shape described in the contract.
- `package.json` declares `express`, `uuid`, and `nodemon` so contributors can run the prototype locally.

## Running locally
1. `npm install` (currently this repository cannot reach `registry.npmjs.org`, so the install step will fail with `ENOTCACHED` unless you have the packages cached or restore network access).
2. `npm start` to launch the service on port `4000` (set `PORT` to override).

## Contract coverage
- Accepts `slot_id`, `qty`, and `guest` while distinguishing guests from WP users via the `x-wp-user-id` header.
- Returns `200 OK` with the committed signup and the updated availability snapshot, `409 Conflict` whenever a slot is full, `422 Unprocessable Entity` for validation failures, and `403 Forbidden` when the slot is locked or past its cutoff.
- Every non-2xx response that tracks availability includes a `snapshot` object so the frontend can discard stale assumptions.

## Data model
- Slots are stored in memory with a single example slot (`id: 12`, capacity `10`, max `qty: 3`, five remaining).
- Signups are added to an in-memory array so the API can demonstrate idempotency and availability adjustments within a single run.
