# Flow Gameplan Creator

Flow Gameplan Creator converts flow specs into polished, Miro-style visual diagrams for email/SMS automation plans.

Current implementation includes:
- schema validation and deterministic layout
- package template expansion (Core/Growth/Full)
- interactive web preview (clickable nodes)
- JSON import/export and PNG export
- Miro API exporter library

## Project Structure

```text
Flow-Gameplan-Creator/
  apps/
    web/        # React + Vite client UI
  libs/
    core/       # Flow schema, fixtures, template expansion
    layout/     # Deterministic node/edge layout engine
    miro/       # Miro API export adapter with retry logic
  STEP_01_SCOPE_AND_ACCEPTANCE.md
```

## Requirements

- Node.js 18+ (recommended 20+)
- npm

## Install

Run once from project root:

```bash
npm --prefix ./libs/core install
npm --prefix ./libs/layout install
npm --prefix ./libs/miro install
npm --prefix ./apps/web install
```

## Run Web App

From project root:

```bash
npm run dev:web
```

Then open:
- `http://localhost:5173`

If the port is busy:

```bash
npm --prefix ./apps/web run dev -- --port 5174
```

## Test and Build

From project root:

```bash
npm run test:all
npm run build:web
```

## Visual QA Checklist (2-3 minutes)

1. Open app and switch presets:
   - Welcome Series
   - Core Foundation
   - Growth Engine
   - Full System
2. Click multiple nodes and confirm details panel updates.
3. Confirm split branches show readable Yes/No labels.
4. Adjust zoom and verify canvas remains legible.
5. Export JSON, then import the same JSON.
6. Export PNG and confirm downloaded image opens.

## Miro Export Adapter

The Miro exporter currently lives in `libs/miro` as a library function:

- `exportFlowToMiro(options)`

Required options:
- `boardId`
- `accessToken`
- `flowSpec`

Behavior:
- creates shapes for nodes
- creates connectors for edges
- retries on 429/5xx responses with backoff

Note:
- API integration is implemented at library level; UI-triggered export to Miro can be added next.

## Notes

- v1 intentionally has no auth and no database.
- `apps/web/dist` and all `node_modules` are gitignored.
