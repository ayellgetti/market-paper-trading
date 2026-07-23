# Developer Guide — Paper Trading Platform

A practical guide for developers and contributors to **run, use, and extend** the paper trading app. For the full product specification and roadmap, see [PAPER_TRADING_APP.md](./PAPER_TRADING_APP.md).

---

## Table of Contents

1. [What This Project Is](#1-what-this-project-is)
2. [Quick Start](#2-quick-start)
3. [Repository Layout](#3-repository-layout)
4. [How the System Works](#4-how-the-system-works)
5. [Using the Web App](#5-using-the-web-app)
6. [REST API Reference](#6-rest-api-reference)
7. [WebSocket Quotes](#7-websocket-quotes)
8. [Paper Trading Engine](#8-paper-trading-engine)
9. [Environment Variables](#9-environment-variables)
10. [Common Development Tasks](#10-common-development-tasks)
11. [Current Status & Roadmap](#11-current-status--roadmap)

---

## 1. What This Project Is

This is a **self-hosted paper trading platform** for learning Indian equity markets. Users get a virtual account (default ₹10,00,000), search NSE stocks, place paper orders, and track positions and P/L — without risking real money.

| Layer | Technology |
|-------|------------|
| Monorepo | pnpm workspaces |
| API | Fastify + TypeScript |
| Database | PostgreSQL + Prisma |
| Cache / pub-sub | Redis |
| Real-time quotes | WebSocket hub |
| Frontend | React 19 + Vite |
| Market data (dev) | Mock broker adapter (simulated ticks) |

**Legal note:** This is a personal simulation tool, not a SEBI-regulated platform. Paper orders never reach a live broker unless you explicitly build and enable live mode later.

---

## 2. Quick Start

### Prerequisites

- **Node.js** ≥ 20
- **pnpm** 10.x (`corepack enable && corepack prepare pnpm@10.11.0 --activate`)
- **Docker** (for PostgreSQL and Redis)

### First-time setup

```bash
# 1. Clone and install dependencies
pnpm install

# 2. Copy environment file
cp .env.example .env

# 3. Start infrastructure (Postgres on host port 5433, Redis on 6379)
pnpm docker:up

# 4. Run database migrations
pnpm db:migrate

# 5. Generate Prisma client (also runs after migrate)
pnpm db:generate

# 6. Start all services in dev mode
pnpm dev
```

### What starts with `pnpm dev`

| Service | Package | Default URL |
|---------|---------|-------------|
| REST API | `@paper-trading/api` | http://localhost:3000 |
| WebSocket hub | `@paper-trading/ws-hub` | ws://localhost:3001/ws |
| Market ingest | `@paper-trading/market-ingest` | (background worker) |
| Web UI | `@paper-trading/web` | http://localhost:5173 |

### Verify everything is healthy

```bash
curl http://localhost:3000/health   # → {"status":"ok"}
curl http://localhost:3001/health   # → {"status":"ok"}
```

Open http://localhost:5173, register a new account, and start paper trading.

### Run services individually

```bash
pnpm dev:api      # API only
pnpm dev:ws       # WebSocket hub only
pnpm dev:ingest   # Market data ingest only
pnpm dev:web      # Frontend only
```

---

## 3. Repository Layout

```
market-paper-trading/
├── apps/
│   └── web/                 # React trading UI (Vite)
├── packages/
│   ├── api/                 # REST API (auth, orders, positions, …)
│   ├── ws-hub/              # WebSocket server; fans out quote ticks
│   ├── market-ingest/       # Subscribes to broker feed, writes ticks, fills orders
│   ├── oms/                 # Order Management + paper fill + risk engine
│   ├── broker-adapters/     # Broker interfaces + mock adapter + instrument seed
│   ├── db/                  # Shared Prisma client export
│   ├── strategy-sdk/        # Base class for algo strategies (types + hooks)
│   └── algo-runner/         # Algo execution service (stub — not wired yet)
├── prisma/
│   ├── schema.prisma        # Database schema
│   └── migrations/          # SQL migrations
├── docker-compose.yml       # Postgres + Redis only (app services run via pnpm)
├── .env.example             # Environment template
├── PAPER_TRADING_APP.md     # Full product spec & roadmap
└── DEVELOPER_GUIDE.md       # This file
```

### Package responsibilities

| Package | Role |
|---------|------|
| `api` | HTTP entry point. JWT auth, order placement, account/position/trade queries. Seeds instruments on startup. |
| `market-ingest` | Connects to broker adapter, persists ticks, triggers limit-order fills and MTM updates, publishes ticks to Redis. |
| `ws-hub` | Subscribes to Redis `quotes` channel and pushes ticks to connected browser clients. |
| `oms` | `OrderService` — validates margin, creates/fills/cancels orders, updates positions and account balances. |
| `broker-adapters` | `MockBrokerAdapter` simulates live prices; `seedInstruments()` loads 10 NSE equities into Postgres. |
| `strategy-sdk` | Abstract `Strategy` class with `onTick`, `placeOrder`, etc. for future algo trading. |
| `web` | Single-page app: login/register, order pad, positions, trade log, live LTP. |

---

## 4. How the System Works

### High-level architecture

```mermaid
flowchart TB
    subgraph Browser
        WEB[apps/web]
    end

    subgraph NodeServices
        API[packages/api]
        WS[packages/ws-hub]
        ING[packages/market-ingest]
        OMS[packages/oms]
    end

    subgraph Data
        PG[(PostgreSQL)]
        RD[(Redis)]
    end

    MOCK[MockBrokerAdapter]

    WEB -->|REST + JWT| API
    WEB -->|WebSocket| WS
    API --> OMS
    API --> PG
    OMS --> PG
    ING --> MOCK
    ING --> OMS
    ING --> PG
    ING -->|publish quotes| RD
    RD -->|subscribe| WS
    WS -->|tick events| WEB
```

### Request flow: placing a market order

1. User clicks **Buy** or **Sell** in the web UI.
2. `POST /api/v1/orders` hits the API with JWT and order details.
3. API fetches the latest LTP from `market_ticks` (or uses limit price).
4. `OrderService.placeOrder()` checks margin via `RiskEngine`, creates an `orders` row.
5. For **MARKET** orders, the order is filled immediately at the current LTP.
6. A `trades` row is created; `positions` and `paper_accounts` balances are updated in a transaction.
7. UI refreshes funds, positions, and trade log.

### Market data flow

1. `market-ingest` starts and calls `seedInstruments()` (10 NSE stocks).
2. `MockBrokerAdapter` emits a price tick every **2 seconds** per subscribed instrument (random walk ±0.1%).
3. Each tick is:
   - Saved to `market_ticks`
   - Used to fill any **OPEN** limit orders (`processOpenOrders`)
   - Used to update unrealized P/L (`updatePositionMTM`)
   - Published to Redis channel `quotes`
4. `ws-hub` receives Redis messages and broadcasts to all WebSocket clients.
5. The web app updates LTP in the order pad and positions table.

### Authentication

- Register or login → receive a **JWT** stored in `localStorage`.
- All protected API routes require `Authorization: Bearer <token>`.
- On register, a default paper account is created with ₹10,00,000, 2% risk, 1.5× reward ratio.

---

## 5. Using the Web App

### Register / Login

1. Open http://localhost:5173
2. Use **Register** for a new account (email + password, min 6 chars).
3. You land on the trading dashboard with your paper account.

### Account panel

- **Available Balance** — cash not tied up in open long positions.
- **Fund Used** — capital deployed in open BUY positions.
- **Unrealized P/L** — mark-to-market on open positions.
- **Risk %** and **Reward** — position-sizing helpers (from the original HTML prototypes). Click **Save Settings** to persist.

### Placing a trade

1. **Search Stock** — type a symbol (e.g. `RELIANCE`, `TCS`). Only NSE equity instruments are seeded today.
2. Select a result — LTP loads from the API and then updates live via WebSocket.
3. Choose **Market** or **Limit**, **CNC** or **MIS**, quantity, optional stop loss / target.
4. Click **Buy** or **Sell**.

| Order type | Behavior |
|------------|----------|
| MARKET | Filled immediately at latest LTP |
| LIMIT | Stays OPEN until LTP crosses your limit price (checked on each tick) |

| Product | Margin rule (paper) |
|---------|---------------------|
| CNC | Full order value required |
| MIS | 20% of order value (intraday leverage simulation) |

### Positions & trade log

- **Positions** — open holdings with avg price, qty, live LTP, unrealized P/L.
- **Trade Log** — history of executed fills (most recent 100).

---

## 6. REST API Reference

Base URL: `http://localhost:3000`  
All routes under `/api/v1/*` except `/health` require a JWT unless noted.

### Auth

| Method | Path | Body | Description |
|--------|------|------|-------------|
| POST | `/api/v1/auth/register` | `{ email, password, name? }` | Create user + default paper account |
| POST | `/api/v1/auth/login` | `{ email, password }` | Login |
| GET | `/api/v1/auth/me` | — | Current user and accounts |

### Accounts

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/accounts` | List paper accounts |
| GET | `/api/v1/accounts/:id` | Account details |
| PATCH | `/api/v1/accounts/:id` | Update `riskPercent`, `rewardRatio`, `name` |
| GET | `/api/v1/accounts/:id/funds` | Aggregated funds summary |

### Instruments

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/instruments/search?q=REL` | Search NSE equity symbols |
| GET | `/api/v1/instruments/:id` | Instrument metadata |
| GET | `/api/v1/instruments/:id/quote` | Latest LTP |

### Orders

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/orders` | Place order (see body below) |
| GET | `/api/v1/orders?status=OPEN` | List orders (optional status filter) |
| DELETE | `/api/v1/orders/:id` | Cancel OPEN or PENDING order |

**Place order body:**

```json
{
  "paperAccountId": "<account-id>",
  "instrumentId": "<instrument-id>",
  "side": "BUY",
  "orderType": "MARKET",
  "productType": "CNC",
  "quantity": 10,
  "price": 2850,
  "stopLoss": 2800,
  "target": 2950
}
```

`price` is required for LIMIT orders. `stopLoss` and `target` are stored on the position but not auto-executed yet.

### Positions & trades

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/positions?accountId=<id>` | Open positions |
| GET | `/api/v1/trades` | Executed trade log |

### Example: curl workflow

```bash
# Register
TOKEN=$(curl -s -X POST http://localhost:3000/api/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"dev@example.com","password":"secret12"}' \
  | jq -r .token)

# Search instruments
curl -s "http://localhost:3000/api/v1/instruments/search?q=RELIANCE" \
  -H "Authorization: Bearer $TOKEN" | jq

# Place a market buy (replace IDs from search + /auth/me)
curl -s -X POST http://localhost:3000/api/v1/orders \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "paperAccountId": "YOUR_ACCOUNT_ID",
    "instrumentId": "YOUR_INSTRUMENT_ID",
    "side": "BUY",
    "orderType": "MARKET",
    "productType": "CNC",
    "quantity": 1
  }' | jq
```

---

## 7. WebSocket Quotes

**URL:** `ws://localhost:3001/ws?token=<jwt>`

In development (`JWT_SECRET=dev-secret`), the token query param is optional.

### Server → client messages

```json
{
  "channel": "quotes",
  "event": "tick",
  "data": {
    "instrumentId": "clx...",
    "symbol": "RELIANCE",
    "ltp": 2851.42,
    "volume": 4521,
    "timestamp": "2026-07-06T14:30:00.000Z"
  }
}
```

### Client → server (optional)

```json
{ "action": "subscribe", "instrumentIds": ["id1", "id2"] }
```

The hub currently broadcasts all ticks to every connected client; subscription is acknowledged but not filtered server-side yet.

---

## 8. Paper Trading Engine

Core logic lives in `packages/oms`.

### Risk engine (`RiskEngine`)

Ported from the original `money-mangement.html` prototype:

- `calculateRiskAmount(balance, riskPercent)` — max risk per trade
- `calculateRewardAmount(risk, rewardRatio)` — target reward
- `calculateQuantity(risk, entry, stopLoss, lotSize)` — position size from risk
- `calculateMargin(orderValue, productType)` — CNC = 100%, MIS = 20%
- `canTrade(available, margin)` — fund check before order acceptance

### Order lifecycle

```
PENDING → (market fill) → COMPLETE
PENDING → (limit not met) → OPEN → (tick crosses limit) → COMPLETE
OPEN | PENDING → (cancel) → CANCELLED
```

### Position updates

- **BUY** — increases position (weighted average price) or opens new position; debits `currentBalance`, credits `fundUsed`.
- **SELL** — reduces or closes position; credits `currentBalance`, updates `realizedProfit` / `realizedLoss`.

### Seeded instruments

`broker-adapters` seeds these NSE equities on API and ingest startup:

`RELIANCE`, `TCS`, `HDFCBANK`, `INFY`, `ICICIBANK`, `HINDUNILVR`, `SBIN`, `BHARTIARTL`, `ITC`, `KOTAKBANK`

Mock prices start near each stock's `basePrice` and drift randomly.

---

## 9. Environment Variables

Copy `.env.example` to `.env`:

| Variable | Default | Used by |
|----------|---------|---------|
| `DATABASE_URL` | `postgresql://papertrading:papertrading_secret@localhost:5433/paper_trading` | api, market-ingest, Prisma |
| `REDIS_URL` | `redis://localhost:6379` | ws-hub, market-ingest |
| `JWT_SECRET` | `change-me-in-production-...` | api, ws-hub |
| `ENCRYPTION_KEY` | (32+ chars) | Future broker credential encryption |
| `API_PORT` | `3000` | api |
| `WS_PORT` | `3001` | ws-hub |
| `API_URL` | `http://localhost:3000` | Future services |
| `WS_URL` | `ws://localhost:3001/ws` | Documentation / future use |

**Frontend** (`apps/web`) uses Vite env vars:

| Variable | Default |
|----------|---------|
| `VITE_API_URL` | `http://localhost:3000` |
| `VITE_WS_URL` | `ws://localhost:3001/ws` |

> **Note:** `docker-compose.yml` maps Postgres to host port **5433** (not 5432) to avoid conflicts with a local Postgres install.

---

## 10. Common Development Tasks

### Database

```bash
pnpm db:migrate        # Create/apply migrations (dev)
pnpm db:migrate:deploy # Apply migrations (CI/production)
pnpm db:push           # Push schema without migration (prototyping only)
pnpm db:studio         # Open Prisma Studio GUI
```

### Code quality

```bash
pnpm typecheck    # TypeScript across all packages
pnpm lint         # ESLint
pnpm format       # Prettier write
pnpm build        # Build all packages
```

### Reset local data

```bash
pnpm docker:down
docker volume rm market-paper-trading_postgres_data market-paper-trading_redis_data 2>/dev/null || true
pnpm docker:up
pnpm db:migrate
```

### Adding a new API route

1. Create a route file under `packages/api/src/routes/`.
2. Register it in `packages/api/src/server.ts` with a `/api/v1/...` prefix.
3. Use `preHandler: [app.authenticate]` for protected routes.
4. Import `prisma` from `@paper-trading/db` or `OrderService` from `@paper-trading/oms` as needed.

### Adding a new instrument

For development, add an entry to `packages/broker-adapters/src/instruments.ts` and restart `api` + `market-ingest`. Both call `seedInstruments()` on startup.

### Extending the web UI

The UI is intentionally monolithic in `apps/web/src/main.tsx` for the MVP. API calls go through `apps/web/src/api/client.ts`. Add new endpoints there first, then wire UI state in the dashboard component.

### Writing an algo strategy (future)

Extend `Strategy` from `@paper-trading/strategy-sdk`:

```typescript
import { Strategy, type Tick } from '@paper-trading/strategy-sdk';

export class MyStrategy extends Strategy {
  async onTick(tick: Tick) {
    const ltp = this.getLTP(tick.instrumentId);
    if (ltp && ltp < 100) {
      await this.placeOrder({
        instrumentId: tick.instrumentId,
        side: 'BUY',
        orderType: 'MARKET',
        productType: 'CNC',
        quantity: 1,
      });
    }
  }
}
```

The `algo-runner` package is a placeholder; deployment and tick dispatch are not implemented yet.

---

## 11. Current Status & Roadmap

### Implemented (MVP)

- User registration / login with JWT
- Default paper account (₹10L virtual capital)
- NSE equity instrument search (10 stocks)
- Mock live market data (2s tick interval)
- Market and limit orders (CNC / MIS)
- Position tracking and unrealized P/L
- Trade log
- Risk % / reward ratio account settings
- React trading dashboard with WebSocket LTP

### Not yet implemented

| Feature | Notes |
|---------|-------|
| Real broker adapters (Zerodha, etc.) | Schema exists; only `MockBrokerAdapter` works |
| F&O, commodity, currency segments | Schema ready; ingest filters `EQUITY` only |
| Stop-loss / target auto-exit | Stored on position, not triggered |
| Algo runner / backtesting | `strategy-sdk` types exist; runner is stub |
| Watchlists, trade journal UI | DB models exist; no API/UI yet |
| Dockerized app services | Only Postgres + Redis in compose |
| Order cancellation UI | API supports `DELETE /orders/:id` |

See [PAPER_TRADING_APP.md](./PAPER_TRADING_APP.md) for the full phased implementation plan, PostgreSQL schema rationale, and broker adapter specification.

---

## Getting Help

- **Spec & architecture deep dive:** [PAPER_TRADING_APP.md](./PAPER_TRADING_APP.md)
- **Database schema:** [prisma/schema.prisma](./prisma/schema.prisma)
- **Health checks:** `GET /health` on API (`:3000`) and WS hub (`:3001`)

When reporting issues, include which services are running (`pnpm dev` vs individual), your `.env` (redact secrets), and relevant API or browser console errors.
