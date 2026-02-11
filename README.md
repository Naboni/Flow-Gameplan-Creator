# Flow Gameplan Creator

AI-powered platform that generates tailored email/SMS flow gameplans for e-commerce brands. Analyzes a brand's website, combines it with a chosen service plan, and outputs a complete set of visual flowcharts.

## Features

- **Generate**: Enter a brand URL + plan → AI creates a full set of tailored flows
- **Viewer**: Browse presets (Welcome Series, Core Foundation, Growth Engine, Full System)
- **Editor**: Drag-and-drop flow builder with custom nodes, edges, and note cards
- **Export**: JSON, PNG, and Miro board export
- **Plans**: Core Foundation (6 flows), Growth Engine (8 flows), Full System (9 flows)

## Project Structure

```text
Flow-Gameplan-Creator/
  apps/
    web/        # React + Vite frontend
    api/        # Express + OpenAI backend
  libs/
    core/       # Flow schema, fixtures, templates, plan registry
    layout/     # Deterministic layout engine
    miro/       # Miro API export adapter
```

## Requirements

- Node.js 18+ (recommended 20+)
- npm
- OpenAI API key (for flow generation)

## Local Development

### 1. Install dependencies

```bash
npm --prefix ./libs/core install
npm --prefix ./libs/layout install
npm --prefix ./libs/miro install
npm --prefix ./apps/web install
npm --prefix ./apps/api install
```

### 2. Configure environment

```bash
cp apps/api/.env.example apps/api/.env
```

Edit `apps/api/.env` and add your OpenAI API key:

```
OPENAI_API_KEY=sk-your-key-here
PORT=3001
```

### 3. Start development servers

Terminal 1 (API):
```bash
npm run dev:api
```

Terminal 2 (Frontend):
```bash
npm run dev:web
```

Open `http://localhost:5173`

### 4. Test and build

```bash
npm run test:all
npm run build:web
npm run build:api
```

## Environment Variables

| Variable | Where | Description |
|---|---|---|
| `OPENAI_API_KEY` | Backend `.env` | OpenAI API key for brand analysis and flow generation |
| `PORT` | Backend `.env` | API server port (default: 3001) |
| `VITE_API_URL` | Frontend build | Backend API URL (default: `http://localhost:3001`) |

## Notes

- v1 has no auth and no database — stateless API
- Generated flows are returned directly to the frontend
- The OpenAI key is only used server-side (never exposed to the browser)
