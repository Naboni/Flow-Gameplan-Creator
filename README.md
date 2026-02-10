# Flow Gameplan Creator

Flow Gameplan Creator converts flow specs into polished, Miro-style visual diagrams for email/SMS automation plans.

Current implementation includes:
- schema validation and deterministic layout
- package template expansion (Core/Growth/Full)
- React Flow canvas with Viewer and Builder modes
- custom flow builder (add nodes, connect, edit, delete)
- JSON import/export, PNG export, and Miro export

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

## Modes and Workflows

### Viewer Mode
- choose presets or imported JSON
- inspect generated flow
- export JSON/PNG/Miro
- no node-add controls

### Builder Mode
- add nodes from builder sidebar
- connect/disconnect nodes
- edit node fields and edge labels
- drag nodes to custom positions
- use `Auto-layout` to reset to deterministic placement

## Visual QA Checklist (3-5 minutes)

1. Open app and switch presets:
   - Welcome Series
   - Core Foundation
   - Growth Engine
   - Full System
2. Switch to Builder mode and add at least one Email node and one Wait node.
3. Connect nodes and edit an edge label in the details panel.
4. Drag a node to a custom position, then export JSON and re-import it.
5. Press `Auto-layout` and confirm graph resets cleanly.
6. Export PNG and confirm downloaded image opens.
7. Export to Miro and verify shapes/connectors are created.

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

## Notes

- v1 intentionally has no auth and no database.
- `apps/web/dist` and all `node_modules` are gitignored.
