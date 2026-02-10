# Step 1 - Scope Lock and Acceptance Rules

This document freezes the v1 product scope and defines what "meets expectations" means before moving to each next step.

## 1) Objective

Build a reliable Flow Gameplan Creator that converts structured flow inputs into polished, Miro-style visual flowcharts for client delivery.

## 2) v1 In-Scope

- Single-user workflow (no sign-in required).
- No database (stateless/session/file-based v1 workflow).
- Input mode:
  - Manual input form and JSON.
  - Prebuilt package templates:
    - Core Foundation
    - Growth Engine
    - Full System
- Channel scope:
  - Email and SMS in v1.
  - Data model remains extensible for WhatsApp later.
- Diagram must represent:
  - Trigger
  - Profile filters (optional block)
  - Wait/delay nodes (minutes, hours, days)
  - Conditional split nodes with explicit branch labels (Yes/No)
  - Message nodes (Email/SMS)
  - Outcomes or branch endings
  - Optional OBJECTIVE/FOCUS side notes per message step
- Deterministic output:
  - Same input always produces the same layout and ordering.

## 3) Out of Scope (v1)

- User auth and roles.
- Persistent storage/database.
- Multi-user collaboration.
- Billing/subscriptions.
- Full CMS/admin template editor.

## 4) Visual Fidelity Requirements

The generated output should match the style patterns from provided Miro references:

- Clean orthogonal connectors with arrowheads.
- Top-down flow spine with readable branch spacing.
- Explicit Yes/No labels at split branches.
- Compact wait blocks between message steps.
- Side note cards for OBJECTIVE/FOCUS attached to relevant steps.
- Professional presentation quality suitable for immediate client sharing.

## 5) Input Modeling Rules (Locked)

- Package templates expand into normalized flow specs.
- "Mirrors another flow" relations are supported (for example: Cart mirrors Checkout).
- Any missing timing values are explicit user-configurable defaults.
- Optional notes are allowed to be blank without breaking generation.

## 6) Test Case Requirement (Locked)

Must include and pass:

- Welcome Series with:
  - 5 emails
  - 2-day delays
  - 1 engaged/non-engaged split

## 7) Quality Bar

- Reliability first: deterministic rendering and predictable behavior.
- Clear validation errors for malformed or incomplete input.
- Output should be polished enough to show directly to a client.
- Architecture should allow adding auth/db in v2 without refactoring core diagram logic.

## 8) Step Gate Criteria

We only move to the next implementation step when current step is approved.

### Gate to Step 2 (Schema)

Step 1 is approved when all below are true:

- v1 in-scope/out-of-scope is explicitly accepted.
- Input mode and template approach are accepted.
- Visual fidelity expectations are accepted.
- No unresolved ambiguity remains for data model boundaries.

## 9) Proposed Defaults (Already Agreed)

- Auth: none for v1.
- Database: none for v1.
- Channel rendering: Email + SMS in v1, extensible model.
- OBJECTIVE/FOCUS notes: optional per step.
