/**
 * Single game instance: state machine for rounds, stages, order book, positions, P&L.
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  GameCode,
  GameState,
  Market,
  MarketId,
  OrderBookSnapshot,
  PlayerId,
  PlayerState,
  RoundStage,
  RoundState,
  Trade,
} from './types';
import { RoundStage as RS } from './types';
import { OrderBook } from './order-book';

const DEFAULT_SPREAD_TIMER_MS = 60_000;
const DEFAULT_OPEN_TRADING_MS = 120_000;
const DEFAULT_NO_TIGHTER_MS = 10_000;
const INITIAL_CASH = 10_000;
const MAX_ANNOUNCEMENTS = 50;

export interface GameConfig {
  gameCode: GameCode;
  spreadTimerMs?: number;
  openTradingTimerMs?: number;
  noTighterWindowMs?: number;
  gamemasterSecret: string;
}

export class GameInstance {
  readonly gameCode: GameCode;
  private status: GameState['status'] = 'lobby';
  private markets: Market[] = [];
  private currentMarketIndex = 0;
  private currentRoundIndex = 0;
  private round: RoundState | null = null;
  private players = new Map<PlayerId, PlayerState>();
  private orderBook: OrderBook | null = null;
  private spreadTimer: ReturnType<typeof setTimeout> | null = null;
  private openTradingTimer: ReturnType<typeof setTimeout> | null = null;
  private noTighterTimer: ReturnType<typeof setTimeout> | null = null;
  private timerInterval: ReturnType<typeof setInterval> | null = null;
  private showIndividualPositions = true;
  private announcements: GameState['announcements'] = [];
  private marketTrueValues: Record<MarketId, number> = {};
  private allMarketsComplete = false;
  private pnlFinalized = false;
  private maxExposure = 0; // 0 = no limit
  private readonly createdAt = Date.now();
  private readonly spreadTimerMs: number;
  private readonly openTradingTimerMs: number;
  private readonly noTighterWindowMs: number;
  private readonly gamemasterSecret: string;
  private onStageChange: ((stage: RoundStage, round: RoundState) => void) | null = null;
  private onOrderBookChange: (() => void) | null = null;
  private onTrade: ((trade: Trade) => void) | null = null;
  private onTimer: ((endsAt: number, secondsRemaining: number) => void) | null = null;

  constructor(config: GameConfig) {
    this.gameCode = config.gameCode;
    this.gamemasterSecret = config.gamemasterSecret;
    this.spreadTimerMs = config.spreadTimerMs ?? DEFAULT_SPREAD_TIMER_MS;
    this.openTradingTimerMs = config.openTradingTimerMs ?? DEFAULT_OPEN_TRADING_MS;
    this.noTighterWindowMs = config.noTighterWindowMs ?? DEFAULT_NO_TIGHTER_MS;
  }

  setCallbacks(callbacks: {
    onStageChange?: (stage: RoundStage, round: RoundState) => void;
    onOrderBookChange?: () => void;
    onTrade?: (trade: Trade) => void;
    onTimer?: (endsAt: number, secondsRemaining: number) => void;
  }) {
    this.onStageChange = callbacks.onStageChange ?? null;
    this.onOrderBookChange = callbacks.onOrderBookChange ?? null;
    this.onTrade = callbacks.onTrade ?? null;
    this.onTimer = callbacks.onTimer ?? null;
  }

  getStatus(): GameState['status'] {
    return this.status;
  }

  getRound(): RoundState | null {
    return this.round;
  }

  getSnapshot(forGamemaster = false, viewerPlayerId?: PlayerId): GameState {
    const round = this.round;
    const marketId = round?.marketId;
    const orderBookSnapshot: OrderBookSnapshot = marketId && this.orderBook
      ? { ...this.orderBook.getSnapshot(), spread: this.orderBook.getSpread() }
      : { bids: [], asks: [] };
    const playersRecord: Record<PlayerId, PlayerState> = {};
    for (const [id, p] of this.players) {
      playersRecord[id] = this.sanitizePlayerState(p);
    }
    const state: GameState = {
      gameCode: this.gameCode,
      status: this.status,
      markets: [...this.markets],
      currentMarketIndex: this.currentMarketIndex,
      currentRoundIndex: this.currentRoundIndex,
      round: round ? { ...round } : null,
      players: playersRecord,
      orderBook: orderBookSnapshot,
      recentTrades: [],
      showIndividualPositions: this.showIndividualPositions,
      announcements: [...this.announcements].slice(-MAX_ANNOUNCEMENTS),
      allMarketsComplete: this.allMarketsComplete,
      pnlFinalized: this.pnlFinalized,
      maxExposure: this.maxExposure || undefined,
      createdAt: this.createdAt,
    };
    if (forGamemaster) {
      state.marketTrueValues = { ...this.marketTrueValues };
      for (const m of this.markets) {
        if (state.marketTrueValues[m.id] === undefined) {
          const computed = this.getMarketTrueValue(m.id);
          if (computed !== undefined) state.marketTrueValues[m.id] = computed;
        }
      }
    }
    if (viewerPlayerId && !forGamemaster && state.players[viewerPlayerId]) {
      state.players[viewerPlayerId] = { ...state.players[viewerPlayerId], cash: 0 };
    }
    return state;
  }

  private sanitizePlayerState(p: PlayerState): PlayerState {
    if (this.showIndividualPositions) return { ...p, positions: { ...p.positions } };
    return {
      ...p,
      positions: {},
      cash: 0,
      roundPnl: 0,
      totalPnl: p.totalPnl,
    };
  }

  addPlayer(playerId: PlayerId, displayName: string, isGamemaster: boolean): void {
    if (this.players.has(playerId)) return;
    const positions: Record<MarketId, PlayerState['positions'][string]> = {};
    for (const m of this.markets) {
      positions[m.id] = { marketId: m.id, quantity: 0 };
    }
    this.players.set(playerId, {
      id: playerId,
      displayName,
      cash: INITIAL_CASH,
      positions,
      roundPnl: 0,
      totalPnl: 0,
      isMarketMaker: false,
      isGamemaster,
    });
  }

  removePlayer(playerId: PlayerId): void {
    this.players.delete(playerId);
  }

  isGamemaster(playerId: PlayerId): boolean {
    const p = this.players.get(playerId);
    return p?.isGamemaster ?? false;
  }

  checkGamemasterSecret(secret: string): boolean {
    return secret === this.gamemasterSecret;
  }

  setGamemaster(playerId: PlayerId): void {
    const p = this.players.get(playerId);
    if (p) p.isGamemaster = true;
  }

  addMarket(market: Market): void {
    this.markets.push(market);
    for (const p of this.players.values()) {
      p.positions[market.id] = { marketId: market.id, quantity: 0 };
    }
    // If game had finished all markets and we just added more, start a round for the next market
    if (!this.round && this.allMarketsComplete && this.currentMarketIndex < this.markets.length) {
      this.allMarketsComplete = false;
      this.startRound();
    }
  }

  setMaxExposure(limit: number): void {
    this.maxExposure = Math.max(0, limit);
  }

  private wouldExceedExposure(playerId: PlayerId, marketId: MarketId, newPositionDelta: number): boolean {
    if (this.maxExposure <= 0) return false;
    const p = this.players.get(playerId);
    if (!p) return true;
    const pos = p.positions[marketId];
    const current = pos?.quantity ?? 0;
    const after = current + newPositionDelta;
    return Math.abs(after) > this.maxExposure;
  }

  setMarketTrueValue(marketId: MarketId, value: number): boolean {
    if (!this.markets.some((m) => m.id === marketId)) return false;
    this.marketTrueValues[marketId] = value;
    return true;
  }

  getMarketTrueValue(marketId: MarketId): number | undefined {
    const direct = this.marketTrueValues[marketId];
    if (direct !== undefined) return direct;
    const market = this.markets.find((m) => m.id === marketId);
    if (!market?.underlyingWeights) return undefined;
    let sum = 0;
    for (const [mid, w] of Object.entries(market.underlyingWeights)) {
      const v = this.getMarketTrueValue(mid as MarketId);
      if (v === undefined) return undefined;
      sum += w * v;
    }
    return sum;
  }

  startGame(): void {
    if (this.status !== 'lobby' || this.markets.length === 0) return;
    this.status = 'playing';
    this.currentMarketIndex = 0;
    this.currentRoundIndex = 0;
    this.startRound();
  }

  private getCurrentMarket(): Market | null {
    return this.markets[this.currentMarketIndex] ?? null;
  }

  private startRound(): void {
    const market = this.getCurrentMarket();
    if (!market) return;
    this.clearTimers();
    this.orderBook = new OrderBook({ marketId: market.id });
    this.round = {
      roundIndex: this.currentRoundIndex,
      stage: RS.SPREAD_QUOTING,
      marketId: market.id,
      bestSpread: null,
      bestSpreadPlayerId: null,
      spreadSubmissions: [],
      marketMakerQuote: null,
      stageEndsAt: null,
      noTighterUntil: undefined,
    };
    for (const p of this.players.values()) {
      p.isMarketMaker = false;
      p.roundPnl = 0;
    }
    this.onStageChange?.(RS.SPREAD_QUOTING, this.round);
  }

  private clearTimers(): void {
    if (this.spreadTimer) clearTimeout(this.spreadTimer);
    if (this.openTradingTimer) clearTimeout(this.openTradingTimer);
    if (this.noTighterTimer) clearTimeout(this.noTighterTimer);
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.spreadTimer = this.openTradingTimer = this.noTighterTimer = this.timerInterval = null;
    if (this.round) this.round.stageEndsAt = null;
  }

  private scheduleStageEnd(ms: number, fn: () => void): void {
    this.clearTimers();
    const endsAt = Date.now() + ms;
    this.round && (this.round.stageEndsAt = endsAt);
    this.onTimer?.(endsAt, Math.max(0, Math.ceil(ms / 1000)));
    this.timerInterval = setInterval(() => {
      const rem = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      this.onTimer?.(endsAt, rem);
    }, 1000);
    const t = setTimeout(() => {
      if (this.timerInterval) clearInterval(this.timerInterval);
      this.timerInterval = null;
      if (this.round?.stage === RS.SPREAD_QUOTING) this.spreadTimer = null;
      else if (this.round?.stage === RS.OPEN_TRADING) this.openTradingTimer = null;
      fn();
    }, ms);
    if (this.round?.stage === RS.SPREAD_QUOTING) this.spreadTimer = t;
    else if (this.round?.stage === RS.OPEN_TRADING) this.openTradingTimer = t;
  }

  private endSpreadQuoting(): void {
    this.clearTimers();
    const r = this.round;
    if (!r || r.stage !== RS.SPREAD_QUOTING) return;
    const mmId = r.bestSpreadPlayerId;
    if (!mmId) {
      r.stage = RS.ROUND_END;
      r.stageEndsAt = null;
      this.onStageChange?.(RS.ROUND_END, r);
      return;
    }
    const mm = this.players.get(mmId);
    if (mm) mm.isMarketMaker = true;
    r.stage = RS.MARKET_MAKER_QUOTE;
    r.stageEndsAt = null;
    this.onStageChange?.(RS.MARKET_MAKER_QUOTE, r);
  }

  submitSpread(playerId: PlayerId, spreadWidth: number): { ok: boolean; error?: string } {
    if (this.players.get(playerId)?.isGamemaster) return { ok: false, error: 'Gamemaster cannot trade' };
    const r = this.round;
    if (!r || r.stage !== RS.SPREAD_QUOTING) return { ok: false, error: 'Not in spread quoting' };
    if (spreadWidth <= 0) return { ok: false, error: 'Spread must be positive' };
    const mustBeTighter = r.bestSpread !== null;
    if (mustBeTighter && spreadWidth >= r.bestSpread) return { ok: false, error: 'Spread must be tighter than current best' };
    r.bestSpread = spreadWidth;
    r.bestSpreadPlayerId = playerId;
    r.spreadSubmissions.push({ playerId, spreadWidth, submittedAt: Date.now() });
    r.noTighterUntil = Date.now() + this.noTighterWindowMs;
    if (this.noTighterTimer) clearTimeout(this.noTighterTimer);
    this.noTighterTimer = setTimeout(() => this.endSpreadQuoting(), this.noTighterWindowMs);
    return { ok: true };
  }

  submitMarketMakerQuote(playerId: PlayerId, bid: number, ask: number): { ok: boolean; error?: string } {
    if (this.players.get(playerId)?.isGamemaster) return { ok: false, error: 'Gamemaster cannot trade' };
    const r = this.round;
    if (!r || r.stage !== RS.MARKET_MAKER_QUOTE) return { ok: false, error: 'Not in MM quote stage' };
    if (r.bestSpreadPlayerId !== playerId) return { ok: false, error: 'Only market maker may quote' };
    const width = ask - bid;
    if (width <= 0 || Math.abs(width - (r.bestSpread ?? 0)) > 1e-6) return { ok: false, error: 'Quote must match your spread width' };
    r.marketMakerQuote = { bid, ask, spreadWidth: width, quotedAt: Date.now() };
    r.stage = RS.FORCED_TRADING;
    r.stageEndsAt = null;
    this.onStageChange?.(RS.FORCED_TRADING, r);
    return { ok: true };
  }

  executeForcedTrade(playerId: PlayerId, direction: 'buy' | 'sell', quantity: number): { ok: boolean; error?: string } {
    if (this.players.get(playerId)?.isGamemaster) return { ok: false, error: 'Gamemaster cannot trade' };
    const r = this.round;
    if (!r || r.stage !== RS.FORCED_TRADING || !r.marketMakerQuote) return { ok: false, error: 'Not in forced trading' };
    if (r.bestSpreadPlayerId === playerId) return { ok: false, error: 'Market maker does not forced trade' };
    const player = this.players.get(playerId);
    if (!player) return { ok: false, error: 'Player not found' };
    if (quantity <= 0) return { ok: false, error: 'Quantity must be positive' };
    const positionDelta = direction === 'buy' ? quantity : -quantity;
    if (this.wouldExceedExposure(playerId, r.marketId, positionDelta)) {
      return { ok: false, error: `Would exceed exposure limit (max ${this.maxExposure})` };
    }
    const mmId = r.bestSpreadPlayerId!;
    const mm = this.players.get(mmId);
    if (mm && this.wouldExceedExposure(mmId, r.marketId, -positionDelta)) {
      return { ok: false, error: 'Market maker would exceed exposure limit' };
    }
    const { bid, ask } = r.marketMakerQuote;
    const price = direction === 'buy' ? ask : bid;
    const cashDelta = direction === 'buy' ? -price * quantity : price * quantity;
    player.cash += cashDelta;
    const pos = player.positions[r.marketId];
    if (pos) {
      const prevQty = pos.quantity;
      pos.quantity += positionDelta;
      const prevCost = pos.avgCost ?? 0;
      pos.avgCost = pos.quantity === 0 ? undefined : (prevCost * Math.abs(prevQty) + price * quantity) / Math.abs(pos.quantity);
    }
    if (mm) {
      mm.cash -= cashDelta;
      const mmPos = mm.positions[r.marketId];
      if (mmPos) mmPos.quantity -= positionDelta;
    }
    const trade: Trade = {
      id: uuidv4(),
      marketId: r.marketId,
      bidOrderId: '' as any,
      askOrderId: '' as any,
      buyerId: direction === 'buy' ? playerId : mmId,
      sellerId: direction === 'sell' ? playerId : mmId,
      price,
      quantity,
      timestamp: Date.now(),
    };
    this.onTrade?.(trade);
    return { ok: true };
  }

  endForcedTrading(): void {
    this.clearTimers();
    const r = this.round;
    if (!r || r.stage !== RS.FORCED_TRADING) return;
    r.stage = RS.OPEN_TRADING;
    r.stageEndsAt = null;
    this.onStageChange?.(RS.OPEN_TRADING, r);
  }

  submitOrder(playerId: PlayerId, side: 'bid' | 'ask', price: number, quantity: number): { ok: boolean; error?: string; trades?: Trade[] } {
    if (this.players.get(playerId)?.isGamemaster) return { ok: false, error: 'Gamemaster cannot trade' };
    const r = this.round;
    if (!r || r.stage !== RS.OPEN_TRADING) return { ok: false, error: 'Not in open trading' };
    if (!this.orderBook) return { ok: false, error: 'No order book' };
    const validator =
      this.maxExposure > 0
        ? (buyerId: PlayerId, sellerId: PlayerId, marketId: MarketId, qty: number) =>
            !this.wouldExceedExposure(buyerId, marketId, qty) &&
            !this.wouldExceedExposure(sellerId, marketId, -qty)
        : undefined;
    try {
      const { order, trades } = this.orderBook.addOrder(playerId, side, price, quantity, validator);
      for (const t of trades) {
        this.applyTrade(t);
        this.onTrade?.(t);
      }
      this.onOrderBookChange?.();
      return { ok: true, trades };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }

  private applyTrade(t: Trade): void {
    const buyer = this.players.get(t.buyerId);
    const seller = this.players.get(t.sellerId);
    const cost = t.price * t.quantity;
    if (buyer) {
      buyer.cash -= cost;
      const pos = buyer.positions[t.marketId];
      if (pos) {
        const prevQty = pos.quantity;
        pos.quantity += t.quantity;
        const prevCost = pos.avgCost ?? 0;
        pos.avgCost = pos.quantity === 0 ? undefined : (prevCost * Math.abs(prevQty) + t.price * t.quantity) / Math.abs(pos.quantity);
      }
    }
    if (seller) {
      seller.cash += cost;
      const pos = seller.positions[t.marketId];
      if (pos) pos.quantity -= t.quantity;
    }
  }

  private endOpenTrading(): void {
    this.openTradingTimer = null;
    const r = this.round;
    if (!r || r.stage !== RS.OPEN_TRADING) return;
    r.stage = RS.ROUND_END;
    r.stageEndsAt = null;
    this.onStageChange?.(RS.ROUND_END, r);
    this.advanceToNextMarket();
  }

  pause(): void {
    this.status = 'paused';
    this.clearTimers();
  }

  resume(): void {
    if (this.status !== 'paused') return;
    this.status = 'playing';
    const r = this.round;
    if (r?.stage === RS.SPREAD_QUOTING && r.stageEndsAt) {
      const ms = Math.max(0, r.stageEndsAt - Date.now());
      this.scheduleStageEnd(ms, () => this.endSpreadQuoting());
    } else if (r?.stage === RS.OPEN_TRADING && r.stageEndsAt) {
      const ms = Math.max(0, r.stageEndsAt - Date.now());
      this.scheduleStageEnd(ms, () => this.endOpenTrading());
    }
  }

  finalizePnl(): { ok: boolean; error?: string } {
    if (!this.allMarketsComplete) return { ok: false, error: 'All markets must complete first' };
    if (this.pnlFinalized) return { ok: true };
    for (const p of this.players.values()) {
      if (p.isGamemaster) continue;
      let settlementValue = p.cash;
      for (const m of this.markets) {
        const pos = p.positions[m.id];
        const qty = pos?.quantity ?? 0;
        const trueVal = this.getMarketTrueValue(m.id);
        if (trueVal !== undefined) settlementValue += qty * trueVal;
      }
      p.totalPnl = settlementValue - INITIAL_CASH;
    }
    this.pnlFinalized = true;
    return { ok: true };
  }

  stop(): boolean {
    if (this.allMarketsComplete && !this.pnlFinalized) return false; // GM must finalize P&L before ending
    this.status = 'stopped';
    this.clearTimers();
    return true;
  }

  nextStage(): void {
    // When all markets were "complete" but more markets were added, allow starting the next market
    if (!this.round && this.allMarketsComplete && this.currentMarketIndex < this.markets.length) {
      this.allMarketsComplete = false;
      this.startRound();
      return;
    }
    const r = this.round;
    if (!r) return;
    if (r.stage === RS.SPREAD_QUOTING) {
      this.clearTimers();
      this.endSpreadQuoting();
    } else if (r.stage === RS.MARKET_MAKER_QUOTE) {
      // skip to forced trading only if quote is set
      if (r.marketMakerQuote) {
        r.stage = RS.FORCED_TRADING;
        this.onStageChange?.(RS.FORCED_TRADING, r);
      }
    } else if (r.stage === RS.FORCED_TRADING) {
      this.endForcedTrading();
    } else if (r.stage === RS.OPEN_TRADING) {
      this.clearTimers();
      this.endOpenTrading();
    } else if (r.stage === RS.ROUND_END) {
      this.advanceToNextMarket();
    }
  }

  private advanceToNextMarket(): void {
    this.currentMarketIndex++;
    if (this.currentMarketIndex < this.markets.length) {
      this.currentRoundIndex = 0;
      this.startRound();
    } else {
      this.allMarketsComplete = true;
      this.round = null;
      this.orderBook = null;
      this.clearTimers();
    }
  }

  prevStage(): void {
    // Minimal rewind: only for demo; full rewind would require state history
    const r = this.round;
    if (!r) return;
    if (r.stage === RS.MARKET_MAKER_QUOTE) {
      r.stage = RS.SPREAD_QUOTING;
      r.stageEndsAt = Date.now() + this.spreadTimerMs;
      this.onStageChange?.(RS.SPREAD_QUOTING, r);
    } else if (r.stage === RS.FORCED_TRADING && r.marketMakerQuote) {
      r.stage = RS.MARKET_MAKER_QUOTE;
      r.marketMakerQuote = null;
      this.onStageChange?.(RS.MARKET_MAKER_QUOTE, r);
    }
  }

  setTimer(seconds: number): void {
    const r = this.round;
    if (!r) return;
    this.clearTimers();
    const ms = seconds * 1000;
    r.stageEndsAt = Date.now() + ms;
    if (r.stage === RS.SPREAD_QUOTING) {
      this.scheduleStageEnd(ms, () => this.endSpreadQuoting());
    } else if (r.stage === RS.OPEN_TRADING) {
      this.scheduleStageEnd(ms, () => this.endOpenTrading());
    }
  }

  setVisibility(showIndividualPositions: boolean): void {
    this.showIndividualPositions = showIndividualPositions;
  }

  addAnnouncement(text: string): void {
    this.announcements.push({ id: uuidv4(), text, at: Date.now() });
    if (this.announcements.length > MAX_ANNOUNCEMENTS) this.announcements.shift();
  }

  getOrderBookSnapshot(): OrderBookSnapshot {
    if (!this.round || !this.orderBook) return { bids: [], asks: [] };
    return { ...this.orderBook.getSnapshot(), spread: this.orderBook.getSpread() };
  }
}
