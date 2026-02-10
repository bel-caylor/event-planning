# 📘 Event Planning — Architecture & Authority Contract

## 🧠 Project Overview
This repository contains early architectural documentation for the Event Planning system — specifically the **contract between the WordPress backend (plugin) and the React frontend**.

The purpose of this document is to clearly define **authority, boundaries, state ownership, and API contract expectations** before writing any code.

---

## 🧩 System Scope & Boundaries

### 🏛 Backend — WordPress Plugin (Source of Truth)
- Owns all business logic and rules
- Enforces capacity, permissions, cutoffs, and conflicts
- Provides REST / Backend-for-Frontend (BFF) endpoints
- Returns canonical state snapshots after mutations

**Authority Rule:**  
If the frontend and backend disagree, the backend always wins.

---

### ⚛ Frontend — React App (UX Orchestrator)
- Manages UI orchestration and presentation
- Owns client-only state (loading, modals, form drafts)
- Renders server-provided meaning and capabilities
- May use optimistic UI, but never commits business decisions

**Authority Rule:**  
React may assume the *shape* of server responses during a screen session, but must always ask the server to confirm business decisions.

---

## 📌 State Ownership

| State Category | Owner | Examples |
|---------------|-------|----------|
| Server State | WordPress | events, slots, signups |
| Client State | React | loading flags, modals, local form state |
| Derived State | React (computed) | availability views, user-specific lists |
| Optimistic State | React (temporary) | pending UI during mutations |

---

## 📜 Frontend Assumptions vs Server Authority

### Frontend May Assume
- The **shape** of server responses remains stable during a screen session
- Server responses include explicit meaning and capability flags
- UI logic renders based on these flags, not inferred rules

### Frontend Must Ask the Server
- Whether a slot is available at commit time
- Whether a signup can be created, edited, canceled, or claimed
- What the canonical availability is after any mutation
- Whether an identity or permission is valid

---

## 🔑 Canonical Availability Rule

**Availability is server-owned.**  
After any mutation (create, update, delete), the frontend must discard any local availability assumptions and replace them with the server’s canonical snapshot.

This system uses a snapshot-on-mutation model. All mutation responses must include updated canonical availability and capability flags so the frontend can re-render without refetching.

The frontend must never:
- Subtract or add to capacity
- Infer availability from signup counts
- Assume optimistic availability is correct

---

## 🧾 Server Response Contract

All mutation endpoints must return a canonical snapshot that includes:

```json
{
  "data": {
    "entity": { },
    "availability": {
      "remaining": 0,
      "can_signup": false,
      "reason": "cutoff_passed"
    },
    "capabilities": {
      "can_edit": false,
      "can_cancel": true
    }
  },
  "errors": []
}
```

Server responses must:
- Use appropriate HTTP status codes (`200`, `401`, `403`, `409`, `422`)
- Include symbolic error codes and human-readable messages
- Include updated availability on conflicts

---

## 🔄 Mutation Flow Contract

For any mutation request:

1. React may show optimistic UI while request is pending
2. Server validates and commits atomically
3. Server returns canonical snapshot
4. React replaces optimistic state with server truth
5. Conflicts (`409`) include updated availability

---

## 🧠 Identity & Capability Model

The server must return explicit capability flags such as:
- `can_signup`
- `can_edit`
- `can_cancel`
- `can_claim`

React renders UI exclusively based on these flags and never infers permissions from raw fields.

---

## ⚠️ Error & Conflict Rules

Standard error handling:
- `401 Unauthorized` — missing or invalid identity
- `403 Forbidden` — insufficient permissions
- `409 Conflict` — capacity or rule conflicts
- `422 Validation` — invalid input
- `429 rate limited` — guest signup abuse

Error responses must include:
- `code`
- `message`
- Optional updated availability snapshot

---

## 🧪 Development Discipline

- Business rules live exclusively on the backend
- Frontend never re-derives meaning from raw fields
- Server responses define semantic meaning
- Architecture decisions must be documented

---

## 🗺 Future Documentation

Planned additions:
- API specification
- Architecture Decision Records (ADRs)
- Data model diagrams
- UI state machine diagrams

---

## 🧠 Core Principle

**React renders meaning. WordPress defines meaning.**
