# Paper Trading App — Specification & Roadmap

A comprehensive product and technical specification for building a broker-like paper trading platform for learning Indian markets before trading with real money.

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Prototype Inventory](#2-prototype-inventory)
3. [Market Segments](#3-market-segments)
4. [Broker-Like UI Modules](#4-broker-like-ui-modules)
5. [Technology Stack (Node.js Only)](#5-technology-stack-nodejs-only)
6. [Architecture](#6-architecture)
7. [PostgreSQL Schema](#7-postgresql-schema)
8. [Market Data Flow](#8-market-data-flow)
9. [Paper Trading Engine (OMS + RMS)](#9-paper-trading-engine-oms--rms)
10. [Algo Trading System](#10-algo-trading-system)
11. [API Surface](#11-api-surface)
12. [Broker Adapter Specification](#12-broker-adapter-specification)
13. [Migration from Prototypes](#13-migration-from-prototypes)
14. [Implementation Phases](#14-implementation-phases)
15. [Non-Functional Requirements](#15-non-functional-requirements)
16. [Docker Compose Services](#16-docker-compose-services)

---

## 1. Introduction

### Purpose

This platform lets retail traders **practice trading across Indian market segments** using virtual capital and **real-time market prices** fetched from broker APIs. Users can place paper orders, track positions and P/L, journal trades, and eventually **deploy algorithmic strategies** that trade automatically — first in paper mode, then on a live broker account.

### Audience

- Beginners learning order types, margin, and risk management
- Discretionary traders testing setups before going live
- Algo traders developing and backtesting TypeScript strategies

### Legal Note

This is a **self-hosted simulation environment**, not a SEBI-regulated virtual trading platform. It runs on your own infrastructure, uses your own broker API credentials for market data, and keeps paper trading completely isolated from live order routing until you explicitly enable live mode.

---

## 2. Prototype Inventory

The current repository contains **five standalone HTML prototypes** with no backend, database, or deployment configuration. Three AngularJS pages depend on a missing `./assets/js/custom/papertrading.js` file.

### 2.1 File-by-File Breakdown

#### `money-mangement.html`

**Purpose:** Position sizing and money management calculator.

**Features:**
- Inputs: account balance, risk %, risk-reward ratio, stop loss, entry price, target price
- `MoneyManagement` ES6 class with:
  - `calculateRisk()` → `balance × risk%`
  - `calculateReward()` → `risk × reward ratio`
  - `calculateQty()` → `risk / (entry − stop_loss)`
  - `canTrade()` → checks if balance covers position cost

**Maturity:** Self-contained and functional, but results print to browser console only — no UI output.

**Keep:** Risk/qty math logic → port to `packages/oms` risk engine and order pad UI.

---

#### `papertrading-1.html`

**Purpose:** Earliest paper-trading prototype with manual trade entry.

**Features:**
- **Add a Trade** form: date, Buy/Sell, stock autocomplete, stop loss, entry price, quantity, target
- **Account Summary** sidebar: starting balance, realized P/L, unrealized P/L, current balance (USD `$` formatting)
- **Trade Log** table: date, action, stock, quantity, price, total cost
- **Position** table: stock, average buy price, quantity held, unrealized P/L

**External dependency:** MoneyControl autosuggest API for stock search.

**Maturity:** UI shell only — requires missing `papertrading.js` for `TradingController` and `addTrade()`.

**Keep:** Trade log and position table structure, manual entry flow as fallback mode.

---

#### `papertrading.html`

**Purpose:** Most complete equity paper-trading UI with risk/reward account management.

**Features:**
- **Account Details:** balance, risk % (live `calculateRiskAmount()`), reward multiplier
- **Search Stock** panel with autocomplete + `onStockSelected` callback
- **Trade panel** (after stock selection): NSE symbol (`stockData.NSEID`), price, stop loss, quantity, target
- Separate **Buy** and **Sell** buttons
- Trade Log and Position tables

**Maturity:** Best reference for the equity MVP order pad and account panel.

**Keep:** Search-then-trade flow, Buy/Sell panel layout, risk/reward account settings.

---

#### `papertrading-2.html`

**Purpose:** Extended account tracking variant (work in progress).

**Features:**
- **Account Details** expanded: fund balance, fund used, realized profit, realized loss, risk, reward
- Same stock search + Buy/Sell trade panel as `papertrading.html`
- Same Trade Log and Position tables

**Known bugs:**
- Risk and Reward inputs incorrectly bound to `tradingData.loss` (copy-paste error)
- Uses `tradingData` model instead of `account` from `papertrading.html`

**Keep:** Fund balance / fund used / realized profit / loss concepts → paper account funds API.

---

#### `univest-market.html`

**Purpose:** Static Univest-style trade log wireframe for multi-segment journaling.

**Features:**
- 14-column trade log table with grouped headers:
  - **Symbol**, **Segment**
  - **Range:** Start, End
  - **Entry:** Date, Price
  - **Exit:** Stoploss, Target
  - **Quantity**, **Expiry**
  - **Our:** Entry, Exit, P/L, P/L Amount
- ~15 placeholder rows, no JavaScript logic

**Maturity:** Layout reference only — defines the target trade journal for F&O and equity.

**Keep:** Full column structure as the trade journal schema and UI target.

---

### 2.2 Prototype Evolution

```mermaid
flowchart LR
    MM[money-mangement.html<br/>Position sizing calc]
    PT1[papertrading-1.html<br/>Manual trade form + P/L]
    PT[papertrading.html<br/>Risk/reward + Buy/Sell flow]
    PT2[papertrading-2.html<br/>Extended funds panel WIP]
    UV[univest-market.html<br/>Multi-segment trade log]

    MM -.->|risk/qty math| PT
    PT1 --> PT
    PT --> PT2
    PT --> UV
```

| Stage | File | What it added |
|-------|------|---------------|
| 1 | `money-mangement.html` | Risk-based position sizing formulas |
| 2 | `papertrading-1.html` | Trade entry, portfolio, P/L tracking |
| 3 | `papertrading.html` | Account risk settings, search-then-trade UX |
| 4 | `papertrading-2.html` | Granular fund tracking (balance, used, profit, loss) |
| 5 | `univest-market.html` | Multi-segment trade journal (Segment, Expiry) |

### 2.3 Keep vs Replace

| Keep | Replace |
|------|---------|
| Money management formulas | Console-only output → order pad suggestions |
| Trade log / position table layouts | AngularJS 1.x → React 19 + TypeScript |
| Risk/reward account panel | In-memory state → PostgreSQL persistence |
| Buy/Sell order pad fields | Manual price entry → live LTP from broker feed |
| Univest trade log columns | Static HTML → dynamic API-driven journal |
| Stock search UX pattern | MoneyControl API → broker master contract DB |

---

## 3. Market Segments

The prototypes cover **equity only**. The full platform supports all major Indian market segments.

### 3.1 Segment Reference

| Segment | Exchange | Product Types | Extra Fields |
|---------|----------|---------------|--------------|
| Equity Delivery | NSE, BSE | CNC | T+1 settlement |
| Equity Intraday | NSE, BSE | MIS | Auto square-off 3:20 PM |
| Futures & Options | NFO, BFO | NRML, MIS | Strike, expiry, CE/PE, lot size |
| Commodity | MCX | NRML, MIS | Lot size, expiry |
| Currency | CDS | NRML, MIS | Lot size, expiry |

### 3.2 Unified Instrument Model

All segments share one instrument schema, inspired by the **Segment** and **Expiry** columns in `univest-market.html`:

```typescript
interface Instrument {
  id: string;
  symbol: string;           // e.g. RELIANCE, NIFTY24JULFUT, NIFTY24100CE
  name: string;             // Full name
  segment: Segment;         // EQUITY | FNO | COMMODITY | CURRENCY
  exchange: Exchange;         // NSE | BSE | NFO | BFO | MCX | CDS
  instrumentType: InstrumentType; // EQ | FUT | CE | PE
  expiry?: Date;            // Required for F&O, commodity, currency
  strike?: number;          // Options only
  lotSize: number;          // 1 for equity, exchange-defined for derivatives
  tickSize: number;         // Minimum price increment
  isin?: string;            // Equity only
  brokerToken?: string;     // Broker-specific instrument token
}

type Segment = 'EQUITY' | 'FNO' | 'COMMODITY' | 'CURRENCY';
type Exchange = 'NSE' | 'BSE' | 'NFO' | 'BFO' | 'MCX' | 'CDS';
type InstrumentType = 'EQ' | 'FUT' | 'CE' | 'PE';
```

### 3.3 Segment-Specific Order Rules

| Rule | Equity CNC | Equity MIS | F&O | MCX | CDS |
|------|-----------|-----------|-----|-----|-----|
| Short selling | No (delivery) | Yes (intraday) | Yes | Yes | Yes |
| Lot-based qty | No | No | Yes | Yes | Yes |
| Expiry handling | N/A | N/A | Auto-exit on expiry | Auto-exit on expiry | Auto-exit on expiry |
| Margin model | Full value | Leverage (e.g. 5x) | SPAN + Exposure | SPAN | SPAN |

---

## 4. Broker-Like UI Modules

### 4.1 Module Map (Prototype → Production)

| Module | Source Prototype | Broker Equivalent | Priority |
|--------|------------------|-------------------|----------|
| Account / Funds | `papertrading.html`, `papertrading-2.html` | Available margin, used margin, P/L | P0 |
| Order Pad | `papertrading.html` Buy/Sell panel | Market / Limit / SL order entry | P0 |
| Trade Log | `univest-market.html` | Tradebook + signal journal | P0 |
| Positions | All `papertrading-*.html` | Open positions with live MTM | P0 |
| Money Management | `money-mangement.html` | Auto qty suggestion on order pad | P1 |
| Watchlist | — (new) | Live LTP watchlist | P1 |
| Order Book | — (new) | Pending / completed / rejected orders | P1 |
| Holdings | — (new) | Delivery equity holdings | P2 |
| Charts | — (new) | Candlestick charts (lightweight-charts) | P2 |
| Algo Studio | — (new) | Create, backtest, deploy, monitor algos | P3 |

### 4.2 Screen Layout (Broker Terminal)

```
┌─────────────────────────────────────────────────────────────────┐
│  Header: Account balance | Used margin | Day P/L | Paper/Live    │
├──────────┬──────────────────────────────┬───────────────────────┤
│          │                              │                       │
│ Watchlist│         Chart Area             │     Order Pad         │
│ (LTP)    │                              │  Buy | Sell           │
│          │                              │  Qty | Price | SL     │
│          │                              │  Target | Product     │
├──────────┴──────────────────────────────┴───────────────────────┤
│  Tabs: Positions | Orders | Trade Log | Holdings | Algos          │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  Active tab content (tables from prototype layouts)         ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

### 4.3 Trade Log Columns (from `univest-market.html`)

The production trade journal preserves all 14 columns:

| Column | Group | Description |
|--------|-------|-------------|
| Symbol | — | Trading symbol |
| Segment | — | EQUITY, FNO, COMMODITY, CURRENCY |
| Range Start | Range | Setup range low |
| Range End | Range | Setup range high |
| Entry Date | Entry | Trade entry timestamp |
| Entry Price | Entry | Executed entry price |
| Stoploss | Exit | Stop loss level |
| Target | Exit | Target price |
| Quantity | — | Order quantity (lots × lot size for derivatives) |
| Expiry | — | Contract expiry (derivatives) |
| Our Entry | Our | Internal/signal entry price |
| Our Exit | Our | Internal/signal exit price |
| P/L | Our | Percentage P/L |
| P/L Amt | Our | Absolute P/L in ₹ |

---

## 5. Technology Stack (Node.js Only)

**Hard constraint:** The entire platform is built with **Node.js and TypeScript**. No Python in any layer — API, workers, algo runtime, migrations, or broker adapters.

| Layer | Technology |
|-------|------------|
| Frontend | React 19 + TypeScript + Vite |
| API | Node.js + Fastify + TypeScript |
| ORM | Prisma → PostgreSQL |
| Real-time | Node.js WebSocket (`@fastify/websocket` or `ws`) |
| Job queue | BullMQ + Redis |
| Algo runtime | Node.js child processes / `worker_threads` |
| Algo SDK | `@paper-trading/strategy-sdk` (TypeScript) |
| Strategy build | `tsup` / `esbuild` |
| Auth | JWT + bcrypt (or OAuth for broker connect) |
| Infra | Docker Compose |

### Monorepo Layout (pnpm workspaces)

```
market-paper-trading/
├── apps/
│   └── web/                    # React broker terminal
├── packages/
│   ├── api/                    # Fastify REST + auth
│   ├── ws-hub/                 # WebSocket quote/order broadcast
│   ├── market-ingest/          # Broker tick ingestion → Postgres
│   ├── oms/                    # Order management + paper fill engine
│   ├── algo-runner/            # Deployed strategy execution
│   ├── strategy-sdk/           # TypeScript Strategy interface
│   └── broker-adapters/        # Zerodha, Angel, Upstox, Fyers, Dhani, NSE
├── prisma/
│   └── schema.prisma
├── docker-compose.yml
├── pnpm-workspace.yaml
└── PAPER_TRADING_APP.md
```

---

## 6. Architecture

### 6.1 System Diagram

```mermaid
flowchart TB
    subgraph ui [Broker-Like UI - React]
        Watchlist[Watchlist and Charts]
        OrderPad[Order Pad]
        TradeLog[Trade Log - Univest style]
        Portfolio[Positions and Holdings]
        AlgoStudio[Algo Builder and Deploy]
    end

    subgraph core [Paper Trading Core - Node.js]
        API[Fastify API]
        OMS[Order Management System]
        RMS[Risk and Margin Engine]
        PnL[PnL and Portfolio Engine]
        AlgoRunner[Algo Execution Runtime]
    end

    subgraph data [Data Layer]
        MarketIngest[Market Data Ingestion]
        PG[(PostgreSQL)]
        Redis[(Redis)]
        WSHub[WebSocket Hub]
    end

    subgraph brokers [Broker Adapters]
        Zerodha[Zerodha Kite]
        Angel[Angel One]
        Upstox[Upstox]
        Fyers[Fyers]
        Dhani[Dhani]
        NSE[NSE India]
    end

    ui --> API
    ui --> WSHub
    API --> OMS
    OMS --> RMS
    OMS --> PnL
    OMS --> PG
    AlgoRunner --> OMS
    AlgoRunner --> Redis
    MarketIngest --> PG
    MarketIngest --> Redis
    MarketIngest --> WSHub
    Redis --> WSHub
    Redis --> AlgoRunner
    brokers --> MarketIngest
    brokers --> OMS
```

### 6.2 Service Responsibilities

| Service | Package | Responsibility |
|---------|---------|----------------|
| `api` | `packages/api` | REST API, auth, CRUD for orders/positions/algos |
| `ws-hub` | `packages/ws-hub` | WebSocket server for quotes, orders, algo events |
| `market-ingest` | `packages/market-ingest` | Connect to broker WebSocket, persist ticks, publish to Redis |
| `oms` | `packages/oms` | Order validation, paper fill simulation, margin checks |
| `algo-runner` | `packages/algo-runner` | Run deployed strategies, emit orders to OMS |
| `broker-adapters` | `packages/broker-adapters` | Normalize broker APIs to common interface |
| `web` | `apps/web` | React frontend |

### 6.3 Paper vs Live Mode

A single OMS code path handles both modes. The execution backend is selected by `order.mode`:

```
Order Request
    │
    ▼
┌─────────┐     mode=PAPER     ┌──────────────────┐
│   OMS   │ ─────────────────► │ PaperFillEngine  │ → Simulated fill at LTP
└─────────┘                    └──────────────────┘
    │
    │ mode=LIVE
    ▼
┌──────────────────┐
│ BrokerAdapter    │ → Real broker API order
└──────────────────┘
```

---

## 7. PostgreSQL Schema

### 7.1 Entity Relationship Diagram

```mermaid
erDiagram
    users ||--o{ paper_accounts : owns
    users ||--o{ broker_connections : has
    users ||--o{ watchlists : creates
    users ||--o{ algos : authors
    users ||--o{ orders : places

    paper_accounts ||--o{ orders : contains
    paper_accounts ||--o{ positions : holds
    paper_accounts ||--o{ holdings : owns

    instruments ||--o{ orders : references
    instruments ||--o{ positions : references
    instruments ||--o{ market_ticks : generates
    instruments ||--o{ candles : aggregates
    instruments ||--o{ watchlist_items : listed_in

    orders ||--o{ trades : fills
    orders ||--o{ algo_signals : triggered_by

    algos ||--o{ algo_deployments : deployed_as
    algo_deployments ||--o{ algo_logs : produces
    algo_deployments ||--o{ algo_signals : emits

    watchlists ||--o{ watchlist_items : contains
```

### 7.2 Prisma Schema

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum Segment {
  EQUITY
  FNO
  COMMODITY
  CURRENCY
}

enum Exchange {
  NSE
  BSE
  NFO
  BFO
  MCX
  CDS
}

enum InstrumentType {
  EQ
  FUT
  CE
  PE
}

enum OrderSide {
  BUY
  SELL
}

enum OrderType {
  MARKET
  LIMIT
  SL
  SL_M
}

enum ProductType {
  CNC
  MIS
  NRML
}

enum OrderStatus {
  PENDING
  OPEN
  COMPLETE
  CANCELLED
  REJECTED
}

enum TradingMode {
  PAPER
  LIVE
}

enum AlgoStatus {
  DRAFT
  BACKTESTING
  DEPLOYED
  PAUSED
  STOPPED
}

enum BrokerType {
  ZERODHA
  ANGEL_ONE
  UPSTOX
  FYERS
  DHANI
  NSE_INDIA
}

model User {
  id        String   @id @default(cuid())
  email     String   @unique
  password  String
  name      String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  paperAccounts      PaperAccount[]
  brokerConnections  BrokerConnection[]
  watchlists         Watchlist[]
  algos              Algo[]
  orders             Order[]
}

model PaperAccount {
  id              String   @id @default(cuid())
  userId          String
  name            String   @default("Default")
  startingBalance Decimal  @db.Decimal(18, 2)
  currentBalance  Decimal  @db.Decimal(18, 2)
  riskPercent     Decimal  @default(2) @db.Decimal(5, 2)
  rewardRatio     Decimal  @default(1.5) @db.Decimal(5, 2)
  fundUsed        Decimal  @default(0) @db.Decimal(18, 2)
  realizedProfit  Decimal  @default(0) @db.Decimal(18, 2)
  realizedLoss    Decimal  @default(0) @db.Decimal(18, 2)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  user      User       @relation(fields: [userId], references: [id])
  orders    Order[]
  positions Position[]
  holdings  Holding[]
}

model Instrument {
  id             String         @id @default(cuid())
  symbol         String
  name           String
  segment        Segment
  exchange       Exchange
  instrumentType InstrumentType
  expiry         DateTime?
  strike         Decimal?       @db.Decimal(18, 2)
  lotSize        Int            @default(1)
  tickSize       Decimal        @db.Decimal(10, 4)
  isin           String?
  brokerToken    String?
  isActive       Boolean        @default(true)
  createdAt      DateTime       @default(now())

  @@unique([symbol, exchange, expiry, strike, instrumentType])
  @@index([segment, exchange])
  @@index([symbol])
}

model BrokerConnection {
  id           String     @id @default(cuid())
  userId       String
  brokerType   BrokerType
  accessToken  String     // encrypted at application layer
  refreshToken String?
  apiKey       String?
  apiSecret    String?    // encrypted
  isActive     Boolean    @default(true)
  expiresAt    DateTime?
  createdAt    DateTime   @default(now())
  updatedAt    DateTime   @updatedAt

  user User @relation(fields: [userId], references: [id])
}

model Watchlist {
  id        String   @id @default(cuid())
  userId    String
  name      String
  createdAt DateTime @default(now())

  user  User             @relation(fields: [userId], references: [id])
  items WatchlistItem[]
}

model WatchlistItem {
  id           String @id @default(cuid())
  watchlistId  String
  instrumentId String
  sortOrder    Int    @default(0)

  watchlist  Watchlist  @relation(fields: [watchlistId], references: [id])
  instrument Instrument @relation(fields: [instrumentId], references: [id])

  @@unique([watchlistId, instrumentId])
}

model Order {
  id              String      @id @default(cuid())
  userId          String
  paperAccountId  String
  instrumentId    String
  mode            TradingMode @default(PAPER)
  side            OrderSide
  orderType       OrderType
  productType     ProductType
  quantity        Int
  price           Decimal?    @db.Decimal(18, 2)
  triggerPrice    Decimal?    @db.Decimal(18, 2)
  stopLoss        Decimal?    @db.Decimal(18, 2)
  target          Decimal?    @db.Decimal(18, 2)
  status          OrderStatus @default(PENDING)
  filledQuantity  Int         @default(0)
  averagePrice    Decimal?    @db.Decimal(18, 2)
  brokerOrderId   String?
  rejectionReason String?
  algoDeploymentId String?
  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt

  user         User          @relation(fields: [userId], references: [id])
  paperAccount PaperAccount  @relation(fields: [paperAccountId], references: [id])
  instrument   Instrument    @relation(fields: [instrumentId], references: [id])
  trades       Trade[]
  algoSignals  AlgoSignal[]

  @@index([userId, status])
  @@index([paperAccountId])
  @@index([instrumentId, status])
}

model Trade {
  id         String   @id @default(cuid())
  orderId    String
  quantity   Int
  price      Decimal  @db.Decimal(18, 2)
  tradedAt   DateTime @default(now())

  order Order @relation(fields: [orderId], references: [id])
}

model Position {
  id             String      @id @default(cuid())
  paperAccountId String
  instrumentId   String
  mode           TradingMode @default(PAPER)
  side           OrderSide
  quantity       Int
  averagePrice   Decimal     @db.Decimal(18, 2)
  productType    ProductType
  unrealizedPL   Decimal     @default(0) @db.Decimal(18, 2)
  stopLoss       Decimal?    @db.Decimal(18, 2)
  target         Decimal?    @db.Decimal(18, 2)
  openedAt       DateTime    @default(now())
  updatedAt      DateTime    @updatedAt

  paperAccount PaperAccount @relation(fields: [paperAccountId], references: [id])
  instrument   Instrument   @relation(fields: [instrumentId], references: [id])

  @@unique([paperAccountId, instrumentId, productType, mode])
}

model Holding {
  id             String   @id @default(cuid())
  paperAccountId String
  instrumentId   String
  quantity       Int
  averagePrice   Decimal  @db.Decimal(18, 2)
  updatedAt      DateTime @updatedAt

  paperAccount PaperAccount @relation(fields: [paperAccountId], references: [id])
  instrument   Instrument   @relation(fields: [instrumentId], references: [id])

  @@unique([paperAccountId, instrumentId])
}

model TradeJournal {
  id           String    @id @default(cuid())
  userId       String
  orderId      String?
  symbol       String
  segment      Segment
  rangeStart   Decimal?  @db.Decimal(18, 2)
  rangeEnd     Decimal?  @db.Decimal(18, 2)
  entryDate    DateTime?
  entryPrice   Decimal?  @db.Decimal(18, 2)
  stopLoss     Decimal?  @db.Decimal(18, 2)
  target       Decimal?  @db.Decimal(18, 2)
  quantity     Int?
  expiry       DateTime?
  ourEntry     Decimal?  @db.Decimal(18, 2)
  ourExit      Decimal?  @db.Decimal(18, 2)
  plPercent    Decimal?  @db.Decimal(10, 4)
  plAmount     Decimal?  @db.Decimal(18, 2)
  notes        String?
  createdAt    DateTime  @default(now())
}

model MarketTick {
  id           String   @id @default(cuid())
  instrumentId String
  ltp          Decimal  @db.Decimal(18, 2)
  open         Decimal? @db.Decimal(18, 2)
  high         Decimal? @db.Decimal(18, 2)
  low          Decimal? @db.Decimal(18, 2)
  close        Decimal? @db.Decimal(18, 2)
  volume       BigInt?
  timestamp    DateTime

  instrument Instrument @relation(fields: [instrumentId], references: [id])

  @@index([instrumentId, timestamp(sort: Desc)])
}

model Candle {
  id           String   @id @default(cuid())
  instrumentId String
  interval     String   // 1m, 5m, 15m, 1h, 1d
  open         Decimal  @db.Decimal(18, 2)
  high         Decimal  @db.Decimal(18, 2)
  low          Decimal  @db.Decimal(18, 2)
  close        Decimal  @db.Decimal(18, 2)
  volume       BigInt   @default(0)
  timestamp    DateTime

  instrument Instrument @relation(fields: [instrumentId], references: [id])

  @@unique([instrumentId, interval, timestamp])
  @@index([instrumentId, interval, timestamp(sort: Desc)])
}

model Algo {
  id          String     @id @default(cuid())
  userId      String
  name        String
  description String?
  sourceCode  String     // TypeScript strategy source
  status      AlgoStatus @default(DRAFT)
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt

  user        User              @relation(fields: [userId], references: [id])
  deployments AlgoDeployment[]
}

model AlgoDeployment {
  id             String     @id @default(cuid())
  algoId         String
  paperAccountId String
  mode           TradingMode @default(PAPER)
  symbols        String[]   // instrument IDs to subscribe
  config         Json       // strategy parameters
  status         AlgoStatus @default(DEPLOYED)
  maxLoss        Decimal?   @db.Decimal(18, 2)
  maxOrdersPerDay Int       @default(100)
  startedAt      DateTime   @default(now())
  stoppedAt      DateTime?

  algo       Algo         @relation(fields: [algoId], references: [id])
  logs       AlgoLog[]
  signals    AlgoSignal[]
}

model AlgoSignal {
  id               String   @id @default(cuid())
  algoDeploymentId String
  orderId          String?
  signalType       String   // BUY, SELL, EXIT
  price            Decimal  @db.Decimal(18, 2)
  reason           String?
  createdAt        DateTime @default(now())

  deployment AlgoDeployment @relation(fields: [algoDeploymentId], references: [id])
  order      Order?         @relation(fields: [orderId], references: [id])
}

model AlgoLog {
  id               String   @id @default(cuid())
  algoDeploymentId String
  level            String   // INFO, WARN, ERROR
  message          String
  createdAt        DateTime @default(now())

  deployment AlgoDeployment @relation(fields: [algoDeploymentId], references: [id])

  @@index([algoDeploymentId, createdAt(sort: Desc)])
}
```

### 7.3 Time-Series Notes

- `market_ticks` grows fast — use **partitioned tables** by month or enable **TimescaleDB** extension for hypertables.
- `candles` are aggregated by a BullMQ job in `market-ingest` on each tick batch.
- Tick retention policy: keep raw ticks for 30 days, candles indefinitely.

---

## 8. Market Data Flow

### 8.1 Sequence Diagram

```mermaid
sequenceDiagram
    participant Broker as Broker WebSocket
    participant Ingest as market-ingest
    participant PG as PostgreSQL
    participant Redis as Redis Pub/Sub
    participant WSHub as ws-hub
    participant UI as React Frontend
    participant Algo as algo-runner
    participant OMS as oms

    Broker->>Ingest: Live tick (LTP, volume, OHLC)
    Ingest->>PG: INSERT market_tick
    Ingest->>Redis: PUBLISH quote:{instrumentId}
    Redis->>WSHub: Forward quote
    Redis->>Algo: on_tick event
    WSHub->>UI: WebSocket quote update
    Algo->>OMS: placeOrder (paper)
    OMS->>PG: INSERT order, trade, position
    OMS->>Redis: PUBLISH order:{userId}
    Redis->>WSHub: Forward order update
    WSHub->>UI: WebSocket order update
```

### 8.2 Ingestion Rules

1. **One active data broker** per user session (selected from connected brokers).
2. **Master contract sync** — daily job downloads instrument list from active broker and upserts `instruments` table.
3. **Subscribe on demand** — when a user adds to watchlist or opens order pad, `market-ingest` subscribes to that symbol on the broker WebSocket.
4. **Unsubscribe** — symbols with no active subscribers for 5 minutes are unsubscribed to save broker API quota.
5. **Store every tick** in PostgreSQL for backtesting replay and audit trail.
6. **UI reads live** from WebSocket; **historical** from REST API querying `candles` table.

### 8.3 Supported Data Sources

| Broker | API | WebSocket | Segments |
|--------|-----|-----------|----------|
| Zerodha | Kite Connect REST | KiteTicker | NSE, BSE, NFO, BFO, MCX, CDS |
| Angel One | SmartAPI REST | SmartWebSocketV2 | NSE, BSE, NFO, BFO, MCX, CDS |
| Upstox | Upstox API v2 | Market Data Feed | NSE, BSE, NFO, MCX |
| Fyers | Fyers API v3 | Fyers Data Socket | NSE, BSE, NFO, MCX |
| Dhani | Dhani API | WebSocket feed | NSE, BSE, NFO |
| NSE India | Public APIs | Limited | Reference/end-of-day data |

---

## 9. Paper Trading Engine (OMS + RMS)

### 9.1 Order Types

| Type | Behavior (Paper) |
|------|------------------|
| MARKET | Fill immediately at current LTP ± configurable slippage |
| LIMIT | Fill when tick price crosses limit price |
| SL | Trigger at stop price, then fill as market order |
| SL-M | Trigger at stop price, fill at limit price |

### 9.2 Fill Simulation

```typescript
// packages/oms/src/paper-fill-engine.ts

function simulateMarketFill(order: Order, ltp: number, slippageBps: number): Trade {
  const slippage = ltp * (slippageBps / 10000);
  const fillPrice = order.side === 'BUY' ? ltp + slippage : ltp - slippage;
  return { quantity: order.quantity, price: fillPrice, tradedAt: new Date() };
}

function checkLimitFill(order: Order, tick: Tick): Trade | null {
  if (order.side === 'BUY' && tick.ltp <= order.price) {
    return { quantity: order.quantity, price: order.price, tradedAt: tick.timestamp };
  }
  if (order.side === 'SELL' && tick.ltp >= order.price) {
    return { quantity: order.quantity, price: order.price, tradedAt: tick.timestamp };
  }
  return null;
}
```

### 9.3 Margin Engine

| Product | Margin Rule |
|---------|---------------|
| CNC (Equity Delivery) | Full order value (price × qty) |
| MIS (Intraday Equity) | ~20% of order value (5x leverage) |
| NRML (F&O) | SPAN margin (simplified: % of contract value per segment) |
| MIS (F&O Intraday) | Reduced margin vs NRML |

### 9.4 Risk Management (from `money-mangement.html`)

Port the `MoneyManagement` class logic into `packages/oms/src/risk-engine.ts`:

```typescript
export class RiskEngine {
  calculateRiskAmount(balance: number, riskPercent: number): number {
    return balance * (riskPercent / 100);
  }

  calculateRewardAmount(riskAmount: number, rewardRatio: number): number {
    return riskAmount * rewardRatio;
  }

  calculateQuantity(riskAmount: number, entryPrice: number, stopLossPrice: number, lotSize = 1): number {
    const riskPerUnit = Math.abs(entryPrice - stopLossPrice);
    if (riskPerUnit === 0) return 0;
    const rawQty = riskAmount / riskPerUnit;
    return Math.floor(rawQty / lotSize) * lotSize;
  }

  canTrade(balance: number, quantity: number, entryPrice: number, requiredMargin: number): boolean {
    return balance >= requiredMargin;
  }
}
```

**Order pad integration:** When user enters entry price and stop loss, auto-suggest quantity based on account risk settings.

### 9.5 Position Management

- **Average price** updated on each buy fill (weighted average).
- **Unrealized P/L** recalculated on every tick: `(ltp − avgPrice) × qty` for long, reversed for short.
- **SL/Target monitoring:** Background job checks open positions against live ticks; triggers exit orders when breached.
- **Auto square-off:** MIS positions closed at 3:20 PM IST (configurable per exchange).
- **T+1 settlement:** CNC buys move to `holdings` after next trading day midnight job.

### 9.6 Default Account Settings

| Setting | Default | Source Prototype |
|---------|---------|------------------|
| Starting balance | ₹10,00,000 | `money-mangement.html` (₹1,00,000) |
| Risk % | 2% | `papertrading.html` |
| Reward ratio | 1.5 | `money-mangement.html` |
| Slippage | 5 bps | New |
| Currency display | ₹ (INR) | Fix from `$` in `papertrading-1.html` |

---

## 10. Algo Trading System

### 10.1 Overview

Users create TypeScript strategies, backtest against historical candles, deploy to paper mode, and later switch to live broker execution — all running on **Node.js**.

### 10.2 Strategy SDK

```typescript
// packages/strategy-sdk/src/index.ts

export interface Tick {
  instrumentId: string;
  symbol: string;
  ltp: number;
  volume: number;
  timestamp: Date;
}

export interface Candle {
  instrumentId: string;
  interval: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp: Date;
}

export interface OrderRequest {
  instrumentId: string;
  side: 'BUY' | 'SELL';
  orderType: 'MARKET' | 'LIMIT' | 'SL' | 'SL_M';
  productType: 'CNC' | 'MIS' | 'NRML';
  quantity: number;
  price?: number;
  triggerPrice?: number;
  stopLoss?: number;
  target?: number;
}

export interface Order {
  id: string;
  status: string;
  side: string;
  quantity: number;
  filledQuantity: number;
  averagePrice: number;
}

export abstract class Strategy {
  protected context: StrategyContext;

  constructor(context: StrategyContext) {
    this.context = context;
  }

  abstract onTick(tick: Tick): void | Promise<void>;
  onCandle?(candle: Candle): void | Promise<void>;
  onOrderUpdate?(order: Order): void | Promise<void>;
  onStart?(): void | Promise<void>;
  onStop?(): void | Promise<void>;

  protected placeOrder(request: OrderRequest): Promise<Order> {
    return this.context.placeOrder(request);
  }

  protected getPositions(): Promise<Position[]> {
    return this.context.getPositions();
  }

  protected getLTP(instrumentId: string): number | undefined {
    return this.context.getLTP(instrumentId);
  }

  protected log(level: 'INFO' | 'WARN' | 'ERROR', message: string): void {
    this.context.log(level, message);
  }
}

export interface StrategyContext {
  placeOrder(request: OrderRequest): Promise<Order>;
  getPositions(): Promise<Position[]>;
  getLTP(instrumentId: string): number | undefined;
  log(level: string, message: string): void;
  config: Record<string, unknown>;
}
```

### 10.3 Example Strategy

```typescript
// Example: Simple moving average crossover
import { Strategy, Tick, Candle, Order } from '@paper-trading/strategy-sdk';

export default class SMACrossover extends Strategy {
  private prices: number[] = [];
  private fastPeriod = 9;
  private slowPeriod = 21;

  onCandle(candle: Candle): void {
    this.prices.push(candle.close);
    if (this.prices.length < this.slowPeriod) return;

    const fast = this.sma(this.fastPeriod);
    const slow = this.sma(this.slowPeriod);
    const prevFast = this.smaAt(this.fastPeriod, 1);
    const prevSlow = this.smaAt(this.slowPeriod, 1);

    if (prevFast <= prevSlow && fast > slow) {
      this.placeOrder({
        instrumentId: candle.instrumentId,
        side: 'BUY',
        orderType: 'MARKET',
        productType: 'MIS',
        quantity: this.context.config.quantity as number,
      });
      this.log('INFO', `BUY signal: fast SMA ${fast} crossed above slow SMA ${slow}`);
    }

    if (prevFast >= prevSlow && fast < slow) {
      this.placeOrder({
        instrumentId: candle.instrumentId,
        side: 'SELL',
        orderType: 'MARKET',
        productType: 'MIS',
        quantity: this.context.config.quantity as number,
      });
      this.log('INFO', `SELL signal: fast SMA ${fast} crossed below slow SMA ${slow}`);
    }
  }

  onOrderUpdate(order: Order): void {
    this.log('INFO', `Order ${order.id} status: ${order.status}`);
  }

  private sma(period: number): number {
    const slice = this.prices.slice(-period);
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  }

  private smaAt(period: number, offset: number): number {
    const end = this.prices.length - offset;
    const slice = this.prices.slice(end - period, end);
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  }
}
```

### 10.4 Algo Lifecycle

```mermaid
stateDiagram-v2
    [*] --> Draft: Create strategy
    Draft --> Backtesting: Run backtest
    Backtesting --> Draft: Revise
    Backtesting --> Deployed: Deploy paper
    Deployed --> Paused: Pause
    Paused --> Deployed: Resume
    Deployed --> Live: Switch to live mode
    Deployed --> Stopped: Kill switch
    Live --> Stopped: Kill switch
    Stopped --> [*]
```

| Step | Action | Service |
|------|--------|---------|
| 1. Create | Write TypeScript in Monaco IDE or upload `.ts` file | `api` → `algos` table |
| 2. Backtest | BullMQ job replays `candles` from Postgres | `algo-runner` (backtest mode) |
| 3. Deploy | Compile with `tsup`, spawn isolated Node process | `algo-runner` |
| 4. Monitor | Logs, signals, P/L via WebSocket | `ws-hub` + `algo_logs` |
| 5. Go Live | Same algo bundle, `mode=LIVE` | `oms` → `BrokerAdapter` |

### 10.5 Deployment Model

- Each deployment = **isolated Node.js child process** running `algo-runner`.
- Strategy compiled to JS bundle via `tsup` before spawn.
- Sandboxed execution: no direct `fs`, `net`, or `child_process` access in strategy code.
- **Circuit breakers:**
  - `maxLoss` — stop algo if cumulative loss exceeds threshold
  - `maxOrdersPerDay` — rate limit orders
  - Kill switch — user or admin can stop all algos instantly
- **Scheduler:** `node-cron` + BullMQ for time-gated strategies (only run during market hours 9:15–15:30 IST).

### 10.6 Phase 2 Optional: Visual Flow Builder

A React Flow-based node editor that compiles visual graphs to TypeScript strategy code. Output is still 100% Node.js — no Python code generation.

---

## 11. API Surface

### 11.1 REST Endpoints

#### Auth

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/auth/register` | Create account |
| POST | `/api/v1/auth/login` | Login, returns JWT |
| POST | `/api/v1/auth/refresh` | Refresh JWT |

#### Paper Account

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/accounts` | List paper accounts |
| POST | `/api/v1/accounts` | Create paper account |
| GET | `/api/v1/accounts/:id` | Account details + funds |
| PATCH | `/api/v1/accounts/:id` | Update risk settings |

#### Instruments

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/instruments/search?q=` | Search by symbol/name |
| GET | `/api/v1/instruments/:id` | Instrument details |
| GET | `/api/v1/instruments/:id/quote` | Latest LTP from DB |

#### Orders

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/orders` | Place order (paper or live) |
| GET | `/api/v1/orders` | List orders (filter by status, date) |
| GET | `/api/v1/orders/:id` | Order details |
| DELETE | `/api/v1/orders/:id` | Cancel pending order |

#### Positions & Holdings

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/positions` | Open positions with MTM |
| GET | `/api/v1/holdings` | Delivery holdings |
| GET | `/api/v1/funds` | Available/used margin |

#### Trades & Journal

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/trades` | Executed trades |
| GET | `/api/v1/journal` | Trade journal (Univest-style) |
| POST | `/api/v1/journal` | Add journal entry |
| PATCH | `/api/v1/journal/:id` | Update journal entry |

#### Market Data

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/candles/:instrumentId?interval=5m&from=&to=` | Historical candles |
| GET | `/api/v1/ticks/:instrumentId?from=&to=` | Historical ticks |

#### Algos

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/algos` | Create algo |
| GET | `/api/v1/algos` | List algos |
| GET | `/api/v1/algos/:id` | Algo details |
| PUT | `/api/v1/algos/:id` | Update source code |
| POST | `/api/v1/algos/:id/backtest` | Run backtest (async, returns job ID) |
| GET | `/api/v1/algos/:id/backtest/:jobId` | Backtest results |
| POST | `/api/v1/algos/:id/deploy` | Deploy algo |
| POST | `/api/v1/algos/:id/stop` | Stop deployment |
| GET | `/api/v1/algos/:id/logs` | Algo logs |

#### Broker

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/broker/connect` | OAuth / API key connect |
| GET | `/api/v1/broker/connections` | List connections |
| DELETE | `/api/v1/broker/connections/:id` | Disconnect broker |
| POST | `/api/v1/broker/sync-instruments` | Sync master contract |

#### Watchlist

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/watchlists` | List watchlists |
| POST | `/api/v1/watchlists` | Create watchlist |
| POST | `/api/v1/watchlists/:id/items` | Add instrument |
| DELETE | `/api/v1/watchlists/:id/items/:itemId` | Remove instrument |

### 11.2 WebSocket Channels

Connect to `ws://host:port/ws?token=<jwt>`

| Channel | Event | Payload |
|---------|-------|---------|
| `quotes` | `tick` | `{ instrumentId, ltp, volume, timestamp }` |
| `orders` | `order_update` | `{ orderId, status, filledQuantity, averagePrice }` |
| `positions` | `position_update` | `{ positionId, unrealizedPL, ltp }` |
| `algo:{deploymentId}` | `log` | `{ level, message, timestamp }` |
| `algo:{deploymentId}` | `signal` | `{ signalType, price, reason }` |
| `funds` | `funds_update` | `{ available, used, total }` |

**Subscribe message:**
```json
{
  "action": "subscribe",
  "channel": "quotes",
  "instrumentIds": ["instr_abc", "instr_def"]
}
```

---

## 12. Broker Adapter Specification

### 12.1 TypeScript Interface

```typescript
// packages/broker-adapters/src/types.ts

export interface BrokerCredentials {
  apiKey: string;
  apiSecret?: string;
  accessToken: string;
  refreshToken?: string;
}

export interface BrokerOrder {
  symbol: string;
  exchange: string;
  side: 'BUY' | 'SELL';
  orderType: 'MARKET' | 'LIMIT' | 'SL' | 'SL_M';
  productType: 'CNC' | 'MIS' | 'NRML';
  quantity: number;
  price?: number;
  triggerPrice?: number;
  validity?: 'DAY' | 'IOC';
}

export interface BrokerOrderResponse {
  brokerOrderId: string;
  status: string;
  message?: string;
}

export interface BrokerPosition {
  symbol: string;
  exchange: string;
  quantity: number;
  averagePrice: number;
  productType: string;
  pnl: number;
}

export interface BrokerFunds {
  available: number;
  used: number;
  total: number;
}

export interface BrokerTick {
  instrumentToken: string;
  ltp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp: Date;
}

export interface BrokerInstrument {
  symbol: string;
  name: string;
  exchange: string;
  instrumentToken: string;
  segment: string;
  instrumentType: string;
  expiry?: string;
  strike?: number;
  lotSize: number;
  tickSize: number;
}

export interface BrokerAdapter {
  readonly brokerType: string;

  connect(credentials: BrokerCredentials): Promise<void>;
  disconnect(): Promise<void>;
  refreshToken(): Promise<BrokerCredentials>;

  // Market Data
  subscribe(instrumentTokens: string[]): void;
  unsubscribe(instrumentTokens: string[]): void;
  onTick(callback: (tick: BrokerTick) => void): void;
  getQuote(instrumentToken: string): Promise<BrokerTick>;

  // Orders (Live mode)
  placeOrder(order: BrokerOrder): Promise<BrokerOrderResponse>;
  modifyOrder(brokerOrderId: string, changes: Partial<BrokerOrder>): Promise<void>;
  cancelOrder(brokerOrderId: string): Promise<void>;

  // Portfolio (Live mode)
  getPositions(): Promise<BrokerPosition[]>;
  getFunds(): Promise<BrokerFunds>;
  getOrderBook(): Promise<BrokerOrderResponse[]>;

  // Instruments
  getInstruments(): Promise<BrokerInstrument[]>;
  searchInstruments(query: string): Promise<BrokerInstrument[]>;

  // Normalization
  normalizeSymbol(brokerInstrument: BrokerInstrument): NormalizedInstrument;
}
```

### 12.2 Adapter Implementations

| Adapter | Package Path | API Docs |
|---------|-------------|----------|
| Zerodha | `broker-adapters/zerodha` | [Kite Connect](https://kite.trade/docs/connect/v3/) |
| Angel One | `broker-adapters/angel-one` | [SmartAPI](https://smartapi.angelbroking.com/docs) |
| Upstox | `broker-adapters/upstox` | [Upstox API](https://upstox.com/developer/api-documentation) |
| Fyers | `broker-adapters/fyers` | [Fyers API](https://myapi.fyers.in/docsv3) |
| Dhani | `broker-adapters/dhani` | Dhani API docs |
| NSE India | `broker-adapters/nse-india` | Public NSE endpoints |

### 12.3 Adapter Factory

```typescript
// packages/broker-adapters/src/factory.ts

import { ZerodhaAdapter } from './zerodha';
import { AngelOneAdapter } from './angel-one';
import { UpstoxAdapter } from './upstox';
import { FyersAdapter } from './fyers';
import { DhaniAdapter } from './dhani';
import { NseIndiaAdapter } from './nse-india';

export function createBrokerAdapter(brokerType: string): BrokerAdapter {
  switch (brokerType) {
    case 'ZERODHA': return new ZerodhaAdapter();
    case 'ANGEL_ONE': return new AngelOneAdapter();
    case 'UPSTOX': return new UpstoxAdapter();
    case 'FYERS': return new FyersAdapter();
    case 'DHANI': return new DhaniAdapter();
    case 'NSE_INDIA': return new NseIndiaAdapter();
    default: throw new Error(`Unknown broker: ${brokerType}`);
  }
}
```

---

## 13. Migration from Prototypes

| Prototype Feature | New Location | Notes |
|-------------------|--------------|-------|
| `MoneyManagement` class | `packages/oms/src/risk-engine.ts` | Port formulas verbatim |
| `calculateRiskAmount()` | `packages/api` account endpoint | Return computed risk in API response |
| `autocomplete-input` directive | `GET /api/v1/instruments/search` | Replace MoneyControl with broker instrument DB |
| Account risk/reward panel | `apps/web` Account Settings page | Bind to `paper_accounts` table |
| Buy/Sell panel | `apps/web` Order Pad component | Add segment selector, product type, order type |
| Trade log table | `apps/web` Trade Journal tab | Full 14-column Univest layout |
| Position table | `apps/web` Positions tab | Add segment, product type, live MTM |
| Fund balance/used/profit/loss | `apps/web` Funds widget | From `papertrading-2.html` |
| `$` currency formatting | All UI | Change to `₹` (INR) |

### Retire

- AngularJS 1.x framework
- MoneyControl autosuggest API (CORS issues, no F&O data)
- Missing `assets/js/custom/papertrading.js`
- Static placeholder rows in `univest-market.html`

---

## 14. Implementation Phases

### Phase 0 — Spec & Setup

**Goal:** Project scaffolding and documentation.

- [x] Write `PAPER_TRADING_APP.md` (this document)
- [ ] Initialize pnpm monorepo with workspace config
- [ ] Docker Compose: PostgreSQL 16, Redis 7
- [ ] Prisma schema + initial migration
- [ ] Shared TypeScript config (`tsconfig.base.json`)
- [ ] ESLint + Prettier setup

**Acceptance criteria:** `docker compose up` starts Postgres and Redis; `pnpm prisma migrate dev` runs successfully.

---

### Phase 1 — Equity Paper Trading MVP

**Goal:** Manual paper trading for NSE equity with live prices.

- [ ] User registration and JWT auth (`packages/api`)
- [ ] Paper account CRUD with risk settings
- [ ] Zerodha Kite adapter for market data (`packages/broker-adapters/zerodha`)
- [ ] Instrument search and master contract sync
- [ ] Market tick ingestion → Postgres → WebSocket (`market-ingest`, `ws-hub`)
- [ ] Order pad: Market and Limit orders for CNC/MIS equity (`packages/oms`)
- [ ] Paper fill engine with slippage
- [ ] Positions with live unrealized P/L
- [ ] Trade log (basic columns from `papertrading.html`)
- [ ] React frontend with account panel, order pad, positions, trade log

**Acceptance criteria:** User can search RELIANCE, see live LTP, place a paper buy order, see position with updating P/L, view trade in log.

---

### Phase 2 — Multi-Segment Support

**Goal:** F&O, commodity, currency with Univest-style trade journal.

- [ ] Extend instrument model for derivatives (expiry, strike, lot size)
- [ ] Segment-specific margin calculations
- [ ] Order validation per segment (lot size multiples, expiry checks)
- [ ] Additional broker adapters (Angel One, Upstox, Fyers, Dhani)
- [ ] Full 14-column trade journal (from `univest-market.html`)
- [ ] Auto square-off for MIS positions at 3:20 PM
- [ ] T+1 settlement job for CNC holdings
- [ ] Holdings page for delivery equity
- [ ] Order book (pending/completed/rejected)

**Acceptance criteria:** User can paper-trade NIFTY FUT, see expiry in journal, MIS position auto-squared off at cutoff.

---

### Phase 3 — Algo Platform

**Goal:** Users create, backtest, and deploy TypeScript strategies.

- [ ] `@paper-trading/strategy-sdk` package
- [ ] Algo CRUD API with Monaco editor in frontend
- [ ] Backtest worker (BullMQ job replaying candles)
- [ ] `algo-runner` deploy service with sandboxed Node.js processes
- [ ] Algo monitoring: logs, signals, P/L via WebSocket
- [ ] Circuit breakers (max loss, max orders/day)
- [ ] Kill switch (stop all algos)
- [ ] Risk engine integration (auto position sizing in algos)

**Acceptance criteria:** User writes SMA crossover strategy, backtests on 30 days of RELIANCE 5m candles, deploys to paper mode, sees automated trades in trade log.

---

### Phase 4 — Live Trading

**Goal:** Connect to real broker for live order execution.

- [ ] Broker OAuth flows (Zerodha, Angel, Upstox, Fyers, Dhani)
- [ ] Encrypted credential storage
- [ ] `mode=LIVE` order routing through broker adapters
- [ ] Paper/Live toggle in UI with confirmation safeguards
- [ ] Live positions and funds sync from broker
- [ ] Audit log for all live orders
- [ ] Rate limiting on broker API calls

**Acceptance criteria:** User connects Zerodha account, toggles to live mode, places a real market order, sees it in broker order book.

---

## 15. Non-Functional Requirements

| Requirement | Target |
|-------------|--------|
| Tick-to-UI latency | < 500ms (broker WS → ingest → Redis → ws-hub → browser) |
| API response time | < 200ms for CRUD endpoints (p95) |
| Concurrent users | 100 per instance (single-server deployment) |
| Broker token security | AES-256 encryption at rest, never logged |
| Audit trail | All orders (paper and live) logged with timestamp, user, source |
| Rate limiting | 100 req/min per user on REST; broker API calls throttled per broker limits |
| Kill switch | Stop all algos + cancel pending orders within 2 seconds |
| Uptime | 99.5% during market hours (9:00–16:00 IST, Mon–Fri) |
| Data retention | Ticks: 30 days; Candles: indefinite; Orders/Trades: indefinite |
| Backup | Daily PostgreSQL dump, 7-day retention |

---

## 16. Docker Compose Services

```yaml
# docker-compose.yml

services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: papertrading
      POSTGRES_PASSWORD: papertrading_secret
      POSTGRES_DB: paper_trading
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

  api:
    build:
      context: .
      dockerfile: packages/api/Dockerfile
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: postgresql://papertrading:papertrading_secret@postgres:5432/paper_trading
      REDIS_URL: redis://redis:6379
      JWT_SECRET: change-me-in-production
    depends_on:
      - postgres
      - redis

  ws-hub:
    build:
      context: .
      dockerfile: packages/ws-hub/Dockerfile
    ports:
      - "3001:3001"
    environment:
      REDIS_URL: redis://redis:6379
      JWT_SECRET: change-me-in-production
    depends_on:
      - redis

  market-ingest:
    build:
      context: .
      dockerfile: packages/market-ingest/Dockerfile
    environment:
      DATABASE_URL: postgresql://papertrading:papertrading_secret@postgres:5432/paper_trading
      REDIS_URL: redis://redis:6379
    depends_on:
      - postgres
      - redis

  algo-runner:
    build:
      context: .
      dockerfile: packages/algo-runner/Dockerfile
    environment:
      DATABASE_URL: postgresql://papertrading:papertrading_secret@postgres:5432/paper_trading
      REDIS_URL: redis://redis:6379
      API_URL: http://api:3000
    depends_on:
      - postgres
      - redis
      - api

  web:
    build:
      context: .
      dockerfile: apps/web/Dockerfile
    ports:
      - "5173:80"
    depends_on:
      - api
      - ws-hub

volumes:
  postgres_data:
  redis_data:
```

### Environment Variables

| Variable | Service | Description |
|----------|---------|-------------|
| `DATABASE_URL` | api, market-ingest, algo-runner | PostgreSQL connection string |
| `REDIS_URL` | all backend services | Redis connection string |
| `JWT_SECRET` | api, ws-hub | JWT signing secret |
| `API_URL` | algo-runner, web | Internal API base URL |
| `WS_URL` | web | WebSocket server URL |
| `ENCRYPTION_KEY` | api | AES key for broker token encryption |

---

## Appendix A: Glossary

| Term | Definition |
|------|------------|
| OMS | Order Management System — validates and routes orders |
| RMS | Risk Management System — margin checks, position limits |
| MTM | Mark-to-Market — unrealized P/L based on current LTP |
| CNC | Cash and Carry — delivery equity product |
| MIS | Margin Intraday Square-off — intraday product |
| NRML | Normal — overnight F&O product |
| SPAN | Standard Portfolio Analysis of Risk — F&O margin calculation |
| LTP | Last Traded Price |
| SL | Stop Loss order type |
| SL-M | Stop Loss Market order type |

## Appendix B: Reference Links

- [Zerodha Kite Connect API](https://kite.trade/docs/connect/v3/)
- [Angel One SmartAPI](https://smartapi.angelbroking.com/docs)
- [Upstox API Documentation](https://upstox.com/developer/api-documentation)
- [Fyers API v3](https://myapi.fyers.in/docsv3)
- [Prisma Documentation](https://www.prisma.io/docs)
- [BullMQ Documentation](https://docs.bullmq.io/)
- [Fastify Documentation](https://fastify.dev/)
