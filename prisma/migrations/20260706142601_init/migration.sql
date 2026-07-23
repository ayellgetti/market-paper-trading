-- CreateEnum
CREATE TYPE "Segment" AS ENUM ('EQUITY', 'FNO', 'COMMODITY', 'CURRENCY');

-- CreateEnum
CREATE TYPE "Exchange" AS ENUM ('NSE', 'BSE', 'NFO', 'BFO', 'MCX', 'CDS');

-- CreateEnum
CREATE TYPE "InstrumentType" AS ENUM ('EQ', 'FUT', 'CE', 'PE');

-- CreateEnum
CREATE TYPE "OrderSide" AS ENUM ('BUY', 'SELL');

-- CreateEnum
CREATE TYPE "OrderType" AS ENUM ('MARKET', 'LIMIT', 'SL', 'SL_M');

-- CreateEnum
CREATE TYPE "ProductType" AS ENUM ('CNC', 'MIS', 'NRML');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'OPEN', 'COMPLETE', 'CANCELLED', 'REJECTED');

-- CreateEnum
CREATE TYPE "TradingMode" AS ENUM ('PAPER', 'LIVE');

-- CreateEnum
CREATE TYPE "AlgoStatus" AS ENUM ('DRAFT', 'BACKTESTING', 'DEPLOYED', 'PAUSED', 'STOPPED');

-- CreateEnum
CREATE TYPE "BrokerType" AS ENUM ('ZERODHA', 'ANGEL_ONE', 'UPSTOX', 'FYERS', 'DHANI', 'NSE_INDIA');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaperAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Default',
    "startingBalance" DECIMAL(18,2) NOT NULL,
    "currentBalance" DECIMAL(18,2) NOT NULL,
    "riskPercent" DECIMAL(5,2) NOT NULL DEFAULT 2,
    "rewardRatio" DECIMAL(5,2) NOT NULL DEFAULT 1.5,
    "fundUsed" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "realizedProfit" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "realizedLoss" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaperAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Instrument" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "segment" "Segment" NOT NULL,
    "exchange" "Exchange" NOT NULL,
    "instrumentType" "InstrumentType" NOT NULL,
    "expiry" TIMESTAMP(3),
    "strike" DECIMAL(18,2),
    "lotSize" INTEGER NOT NULL DEFAULT 1,
    "tickSize" DECIMAL(10,4) NOT NULL,
    "isin" TEXT,
    "brokerToken" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Instrument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrokerConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "brokerType" "BrokerType" NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT,
    "apiKey" TEXT,
    "apiSecret" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrokerConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Watchlist" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Watchlist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WatchlistItem" (
    "id" TEXT NOT NULL,
    "watchlistId" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "WatchlistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "paperAccountId" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,
    "mode" "TradingMode" NOT NULL DEFAULT 'PAPER',
    "side" "OrderSide" NOT NULL,
    "orderType" "OrderType" NOT NULL,
    "productType" "ProductType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "price" DECIMAL(18,2),
    "triggerPrice" DECIMAL(18,2),
    "stopLoss" DECIMAL(18,2),
    "target" DECIMAL(18,2),
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "filledQuantity" INTEGER NOT NULL DEFAULT 0,
    "averagePrice" DECIMAL(18,2),
    "brokerOrderId" TEXT,
    "rejectionReason" TEXT,
    "algoDeploymentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trade" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "price" DECIMAL(18,2) NOT NULL,
    "tradedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Trade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Position" (
    "id" TEXT NOT NULL,
    "paperAccountId" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,
    "mode" "TradingMode" NOT NULL DEFAULT 'PAPER',
    "side" "OrderSide" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "averagePrice" DECIMAL(18,2) NOT NULL,
    "productType" "ProductType" NOT NULL,
    "unrealizedPL" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "stopLoss" DECIMAL(18,2),
    "target" DECIMAL(18,2),
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Position_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Holding" (
    "id" TEXT NOT NULL,
    "paperAccountId" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "averagePrice" DECIMAL(18,2) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Holding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradeJournal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orderId" TEXT,
    "symbol" TEXT NOT NULL,
    "segment" "Segment" NOT NULL,
    "rangeStart" DECIMAL(18,2),
    "rangeEnd" DECIMAL(18,2),
    "entryDate" TIMESTAMP(3),
    "entryPrice" DECIMAL(18,2),
    "stopLoss" DECIMAL(18,2),
    "target" DECIMAL(18,2),
    "quantity" INTEGER,
    "expiry" TIMESTAMP(3),
    "ourEntry" DECIMAL(18,2),
    "ourExit" DECIMAL(18,2),
    "plPercent" DECIMAL(10,4),
    "plAmount" DECIMAL(18,2),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TradeJournal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketTick" (
    "id" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,
    "ltp" DECIMAL(18,2) NOT NULL,
    "open" DECIMAL(18,2),
    "high" DECIMAL(18,2),
    "low" DECIMAL(18,2),
    "close" DECIMAL(18,2),
    "volume" BIGINT,
    "timestamp" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketTick_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Candle" (
    "id" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,
    "interval" TEXT NOT NULL,
    "open" DECIMAL(18,2) NOT NULL,
    "high" DECIMAL(18,2) NOT NULL,
    "low" DECIMAL(18,2) NOT NULL,
    "close" DECIMAL(18,2) NOT NULL,
    "volume" BIGINT NOT NULL DEFAULT 0,
    "timestamp" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Candle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Algo" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sourceCode" TEXT NOT NULL,
    "status" "AlgoStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Algo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlgoDeployment" (
    "id" TEXT NOT NULL,
    "algoId" TEXT NOT NULL,
    "paperAccountId" TEXT NOT NULL,
    "mode" "TradingMode" NOT NULL DEFAULT 'PAPER',
    "symbols" TEXT[],
    "config" JSONB NOT NULL,
    "status" "AlgoStatus" NOT NULL DEFAULT 'DEPLOYED',
    "maxLoss" DECIMAL(18,2),
    "maxOrdersPerDay" INTEGER NOT NULL DEFAULT 100,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stoppedAt" TIMESTAMP(3),

    CONSTRAINT "AlgoDeployment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlgoSignal" (
    "id" TEXT NOT NULL,
    "algoDeploymentId" TEXT NOT NULL,
    "orderId" TEXT,
    "signalType" TEXT NOT NULL,
    "price" DECIMAL(18,2) NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AlgoSignal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlgoLog" (
    "id" TEXT NOT NULL,
    "algoDeploymentId" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AlgoLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Instrument_segment_exchange_idx" ON "Instrument"("segment", "exchange");

-- CreateIndex
CREATE INDEX "Instrument_symbol_idx" ON "Instrument"("symbol");

-- CreateIndex
CREATE UNIQUE INDEX "Instrument_symbol_exchange_expiry_strike_instrumentType_key" ON "Instrument"("symbol", "exchange", "expiry", "strike", "instrumentType");

-- CreateIndex
CREATE UNIQUE INDEX "WatchlistItem_watchlistId_instrumentId_key" ON "WatchlistItem"("watchlistId", "instrumentId");

-- CreateIndex
CREATE INDEX "Order_userId_status_idx" ON "Order"("userId", "status");

-- CreateIndex
CREATE INDEX "Order_paperAccountId_idx" ON "Order"("paperAccountId");

-- CreateIndex
CREATE INDEX "Order_instrumentId_status_idx" ON "Order"("instrumentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Position_paperAccountId_instrumentId_productType_mode_key" ON "Position"("paperAccountId", "instrumentId", "productType", "mode");

-- CreateIndex
CREATE UNIQUE INDEX "Holding_paperAccountId_instrumentId_key" ON "Holding"("paperAccountId", "instrumentId");

-- CreateIndex
CREATE INDEX "MarketTick_instrumentId_timestamp_idx" ON "MarketTick"("instrumentId", "timestamp" DESC);

-- CreateIndex
CREATE INDEX "Candle_instrumentId_interval_timestamp_idx" ON "Candle"("instrumentId", "interval", "timestamp" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "Candle_instrumentId_interval_timestamp_key" ON "Candle"("instrumentId", "interval", "timestamp");

-- CreateIndex
CREATE INDEX "AlgoLog_algoDeploymentId_createdAt_idx" ON "AlgoLog"("algoDeploymentId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "PaperAccount" ADD CONSTRAINT "PaperAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrokerConnection" ADD CONSTRAINT "BrokerConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Watchlist" ADD CONSTRAINT "Watchlist_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WatchlistItem" ADD CONSTRAINT "WatchlistItem_watchlistId_fkey" FOREIGN KEY ("watchlistId") REFERENCES "Watchlist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WatchlistItem" ADD CONSTRAINT "WatchlistItem_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_paperAccountId_fkey" FOREIGN KEY ("paperAccountId") REFERENCES "PaperAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_paperAccountId_fkey" FOREIGN KEY ("paperAccountId") REFERENCES "PaperAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Holding" ADD CONSTRAINT "Holding_paperAccountId_fkey" FOREIGN KEY ("paperAccountId") REFERENCES "PaperAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Holding" ADD CONSTRAINT "Holding_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeJournal" ADD CONSTRAINT "TradeJournal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketTick" ADD CONSTRAINT "MarketTick_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Candle" ADD CONSTRAINT "Candle_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "Instrument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Algo" ADD CONSTRAINT "Algo_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlgoDeployment" ADD CONSTRAINT "AlgoDeployment_algoId_fkey" FOREIGN KEY ("algoId") REFERENCES "Algo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlgoDeployment" ADD CONSTRAINT "AlgoDeployment_paperAccountId_fkey" FOREIGN KEY ("paperAccountId") REFERENCES "PaperAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlgoSignal" ADD CONSTRAINT "AlgoSignal_algoDeploymentId_fkey" FOREIGN KEY ("algoDeploymentId") REFERENCES "AlgoDeployment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlgoSignal" ADD CONSTRAINT "AlgoSignal_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlgoLog" ADD CONSTRAINT "AlgoLog_algoDeploymentId_fkey" FOREIGN KEY ("algoDeploymentId") REFERENCES "AlgoDeployment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
