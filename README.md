# Flow Gameplan Creator

AI-powered platform that generates tailored email/SMS flow gameplans for e-commerce brands. Provide a brand URL and a service plan — the AI scrapes the site, analyzes the brand, and outputs a full set of visual automation flowcharts ready to export or edit.

---

## Features

- **Generate** — Enter a brand URL and select a plan; the AI produces a complete set of named flows with nodes, edges, copy hints, and messaging strategy
- **Chat refinement** — After generation, iterate on any flow through a conversational interface
- **Library** — Browse read-only preset flows (Welcome Series, Core Foundation, Growth Engine, Full System)
- **Editor** — Drag-and-drop canvas to build or modify flows; import/export JSON; multi-flow editing
- **Export** — Download as JSON, PNG, or push directly to a Miro board

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite 5, TypeScript (strict) |
| Styling | Tailwind CSS, Radix UI (shadcn/ui), lucide-react |
| Canvas | ReactFlow 11 |
| Backend | Express 4, Node.js 20 |
| AI | OpenAI SDK 4 |
| Scraping | Cheerio |
| Validation | Zod |
| Monorepo | pnpm workspaces |

---

## Project Structure

```
Flow-Gameplan-Creator/
├── apps/
│   ├── api/                  # Express + OpenAI backend
│   │   └── src/
│   │       ├── routes/       # analyze-brand, generate-flows, chat-flow, library, fillout
│   │       └── lib/          # brandAnalyzer, flowGenerator, openai wrapper, libraryStore
│   └── web/                  # React + Vite frontend
│       └── src/
│           ├── App.tsx        # Root component — shared state + layout
│           ├── hooks/         # Feature hooks (generate, editor, canvas, actions, export)
│           ├── components/    # UI components (AppNavbar, MainCanvas, DetailsPanel, …)
│           ├── utils/         # Stateless helpers (flowNormalize, …)
│           ├── types/         # Shared TypeScript types
│           ├── constants.ts   # App-wide constants
│           └── docs/          # In-repo documentation (architecture, components, hooks)
├── libs/
│   ├── core/                 # Flow schema, fixtures, templates, plan registry
│   ├── layout/               # Deterministic graph layout engine
│   └── miro/                 # Miro API export adapter
└── package.json              # Root workspace scripts
```

---

## Prerequisites

- **Node.js** 18+ (20+ recommended)
- **npm** 9+ (ships with Node.js)
- **OpenAI API key** — used server-side only; never exposed to the browser

---

## Getting Started

### 1. Clone the repository

```bash
git clone <repo-url>
cd Flow-Gameplan-Creator
```

### 2. Install dependencies

Install each package separately (pnpm workspaces are declared but each app/lib uses npm under the hood via the root scripts):

```bash
npm --prefix ./libs/core install
npm --prefix ./libs/layout install
npm --prefix ./libs/miro install
npm --prefix ./apps/api install
npm --prefix ./apps/web install
```

### 3. Configure environment variables

```bash
cp apps/api/.env.example apps/api/.env
```

Open `apps/api/.env` and fill in your values:

```env
OPENAI_API_KEY=sk-...
PORT=3001

# Optional — only needed for Fillout survey integration
FILLOUT_API_KEY=
```

### 4. Start development servers

Open two terminals:

```bash
# Terminal 1 — API (http://localhost:3001)
npm run dev:api

# Terminal 2 — Frontend (http://localhost:5173)
npm run dev:web
```

The frontend auto-proxies API requests to `http://localhost:3001`.

---

## Available Scripts

All scripts are run from the **repository root**:

| Script | Description |
|---|---|
| `npm run dev:api` | Start API in watch mode (`tsx watch`) |
| `npm run dev:web` | Start Vite dev server |
| `npm run build:api` | Bundle API with esbuild → `apps/api/dist/` |
| `npm run build:web` | Build frontend with Vite → `apps/web/dist/` |
| `npm run test:core` | Run `@flow/core` tests |
| `npm run test:layout` | Run `@flow/layout` tests |
| `npm run test:miro` | Run `@flow/miro` tests |
| `npm run test:all` | Run all library tests |

---

## Environment Variables

| Variable | Where | Required | Description |
|---|---|---|---|
| `OPENAI_API_KEY` | `apps/api/.env` | Yes | OpenAI key for brand analysis and flow generation |
| `PORT` | `apps/api/.env` | No | API port (default: `3001`) |
| `FILLOUT_API_KEY` | `apps/api/.env` | No | Fillout API key for survey integration |
| `VITE_API_URL` | frontend build env | No | Override API base URL (default: `http://localhost:3001`) |

---

## API Overview

All endpoints are prefixed with `/api`:

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Health check — returns `{ status: "ok" }` |
| `POST` | `/analyze-brand` | Scrape a brand URL and extract brand context |
| `POST` | `/generate-flows` | Generate a full set of flows for a brand + plan |
| `POST` | `/chat-flow` | Refine a flow spec via conversational prompt |
| `POST` | `/fillout-lookup` | Look up Fillout survey responses (optional) |
| `GET` | `/library/:flowType` | Fetch a library flow template |
| `POST` | `/library/:flowType` | Create/overwrite a library template |
| `PUT` | `/library/:flowType` | Update a library template |
| `DELETE` | `/library/:flowType` | Delete a library template |

> The API is stateless — no database. Generated flows are returned directly to the frontend. Library templates are held in memory and reset on server restart.

---

## Architecture

The frontend is a single-page React app. All state lives in `AppInner` and is divided across five feature hooks:

| Hook | Responsibility |
|---|---|
| `useGenerateFlow` | Generate-tab form state, brand analysis, flow generation, chat |
| `useEditorFlow` | Editor-tab canvas state, node/edge CRUD, preset loading, multi-flow management |
| `useFlowCanvas` | Derives ReactFlow nodes/edges from the active flow; handles auto-positioning |
| `useNodeActions` | Node interaction callbacks (preview, edit, delete, status); polls `localStorage` for email editor changes |
| `useExportImport` | JSON, PNG, and Miro export/import handlers |

For more detail see the in-repo docs:

- [`apps/web/src/docs/architecture.md`](apps/web/src/docs/architecture.md) — data flow, key patterns, design decisions
- [`apps/web/src/docs/components.md`](apps/web/src/docs/components.md) — every component with its props
- [`apps/web/src/docs/hooks.md`](apps/web/src/docs/hooks.md) — every hook with its parameters and return values

---

## Notes

- The OpenAI key is used **server-side only** — it is never sent to or stored in the browser
- v1 has no authentication and no persistent database
- The Miro export requires a valid Miro board ID and appropriate board permissions
