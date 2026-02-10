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

## Deployment

### Option A: Render (recommended — free tier available)

**Deploy the API (backend):**

1. Push your repo to GitHub
2. Go to [render.com](https://render.com) → New → Web Service
3. Connect your GitHub repo
4. Settings:
   - **Root directory**: `apps/api`
   - **Build command**: `npm install && npm run build`
   - **Start command**: `npm start`
   - **Environment**: Node
5. Add environment variables:
   - `OPENAI_API_KEY` = your key
   - `PORT` = `3001`
6. Deploy. Copy the URL (e.g. `https://flow-api-xxxx.onrender.com`)

**Deploy the Frontend (static site):**

1. On Render → New → Static Site
2. Connect the same repo
3. Settings:
   - **Root directory**: `apps/web`
   - **Build command**: `npm install && npm run build`
   - **Publish directory**: `dist`
4. Add environment variable:
   - `VITE_API_URL` = your API URL from above (e.g. `https://flow-api-xxxx.onrender.com`)
5. Deploy

### Option B: Vercel (frontend) + Railway (backend)

**Backend on Railway:**

1. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
2. Select your repo, set root to `apps/api`
3. Add environment variables: `OPENAI_API_KEY`, `PORT=3001`
4. Railway auto-detects Node.js. Set:
   - Build: `npm install && npm run build`
   - Start: `npm start`
5. Copy the public URL

**Frontend on Vercel:**

1. Go to [vercel.com](https://vercel.com) → Import Project
2. Set **Root Directory** to `apps/web`
3. Framework Preset: Vite
4. Add environment variable:
   - `VITE_API_URL` = Railway backend URL
5. Deploy

### Option C: Single VPS (DigitalOcean, AWS, etc.)

```bash
# On your server
git clone <your-repo>
cd Flow-Gameplan-Creator

# Install
npm --prefix ./libs/core install
npm --prefix ./libs/layout install
npm --prefix ./libs/miro install
npm --prefix ./apps/web install
npm --prefix ./apps/api install

# Configure
cp apps/api/.env.example apps/api/.env
# Edit .env with your OPENAI_API_KEY

# Build
npm run build:web
npm run build:api

# Serve frontend (use nginx or serve)
npx serve apps/web/dist -l 80

# Start API (use pm2 for production)
npm install -g pm2
cd apps/api && pm2 start dist/server.js --name flow-api
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
