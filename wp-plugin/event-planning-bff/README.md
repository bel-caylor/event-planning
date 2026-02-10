# Event Planning BFF (WordPress)

This lightweight WordPress plugin implements the Event Planning BFF contract directly in WordPress and lets WordPress users reuse their session identities.

## Features

- Registers `POST /wp-json/event-planning/v1/signups` and enforces the contract in WordPress.
- Uses the current WordPress user when authenticated, otherwise treats the request as a guest signup.
- Returns canonical availability snapshots and capability flags per `docs/api-contract.md`.
- Includes dev-only endpoints for contract testing when running in `local` or `development` environments.

## Configuration

1. Install and activate the plugin (drop `wp-plugin/event-planning-bff/` into `wp-content/plugins/event-planning-bff/`).
2. The REST route mirrors the contract from `docs/api-contract.md`, so your frontend can POST directly to WordPress.
3. For dev contract tests, define `EVENT_PLANNING_DEV_SECRET` and call the dev reset endpoint with `x-ep-dev-secret`.

## Development

- WordPress handles the REST entry point and enforces availability, capability flags, and canonical snapshots.
- Keep the plugin focused on the contract so it stays easy to maintain alongside the React frontend.
