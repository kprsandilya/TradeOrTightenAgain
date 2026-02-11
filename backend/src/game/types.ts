/**
 * Shared types and WebSocket event schema for the trading game.
 * All game state is authoritative on the backend.
 */

// ---- Identifiers ----
export type GameCode = string; // 6-char alphanumeric
export type PlayerId = string;
export type MarketId = string;
export type OrderId = string;
export type RoundIndex = number;

// ---- Round stages ----
export enum RoundStage {
  SPREAD_QUOTING = 'SPREAD_QUOTING',
  MARKET_MAKER_QUOTE = 'MARKET_MAKER_QUOTE',
  FORCED_TRADING = 'FORCED_TRADING',
  OPEN_TRADING = 'OPEN_TRADING',
  ROUND_END = 'ROUND_END',
}

// ---- Market ----
export interface Market {
  id: MarketId;
  name: string;
  description: string; // e.g. "Asset payoff", "Event probability"
  /** For derivatives: weights keyed by underlying market id */
  underlyingWeights?: Record<MarketId, number>;
  /** Conditional payoff expression (optional, for derivatives) */
  condition?: string;
}

export interface OrderLevel {
  price: number;
  quantity: number;
  playerIds: string[]; // who has orders at this level (simplified; full book has per-order)
}

export interface OrderBookSnapshot {
  bids: OrderLevel[];
  asks: OrderLevel[];
  lastTradePrice?: number;
  spread?: number;
}

export interface Order {
  id: OrderId;
  marketId: MarketId;
  playerId: PlayerId;
  side: 'bid' | 'ask';
  price: number;
  quantity: number;
  remainingQuantity: number;
  createdAt: number;
}

export interface Trade {
  id: string;
  marketId: MarketId;
  bidOrderId: OrderId;
  askOrderId: OrderId;
  buyerId: PlayerId;
  sellerId: PlayerId;
  price: number;
  quantity: number;
  timestamp: number;
}

// ---- Player state ----
export interface PlayerPosition {
  marketId: MarketId;
  quantity: number; // positive = long, negative = short
  avgCost?: number;
}

export interface PlayerState {
  id: PlayerId;
  displayName: string;
  cash: number;
  positions: Record<MarketId, PlayerPosition>;
  roundPnl: number;
  totalPnl: number;
  isMarketMaker: boolean;
  isGamemaster: boolean;
}

// ---- Round state ----
export interface SpreadSubmission {
  playerId: PlayerId;
  spreadWidth: number;
  submittedAt: number;
}

export interface MarketMakerQuote {
  bid: number;
  ask: number;
  spreadWidth: number;
  quotedAt: number;
}

export interface RoundState {
  roundIndex: RoundIndex;
  stage: RoundStage;
  marketId: MarketId;
  /** Best spread so far during SPREAD_QUOTING */
  bestSpread: number | null;
  bestSpreadPlayerId: PlayerId | null;
  spreadSubmissions: SpreadSubmission[];
  /** Set when stage is MARKET_MAKER_QUOTE or later */
  marketMakerQuote: MarketMakerQuote | null;
  /** Stage end timestamp (server time) */
  stageEndsAt: number | null;
  /** No-tighter-spread window: end time for SPREAD_QUOTING */
  noTighterUntil?: number;
}

// ---- Game state ----
export type GameStatus = 'lobby' | 'playing' | 'paused' | 'stopped';

export interface GameState {
  gameCode: GameCode;
  status: GameStatus;
  markets: Market[];
  currentMarketIndex: number;
  currentRoundIndex: RoundIndex;
  round: RoundState | null;
  players: Record<PlayerId, PlayerState>;
  orderBook: OrderBookSnapshot;
  recentTrades: Trade[];
  /** Gamemaster-only: show individual positions? */
  showIndividualPositions: boolean;
  /** Broadcast messages (announcements, news) */
  announcements: Array< { id: string; text: string; at: number }>;
  /** Gamemaster-only: true value per market (set by GM before/during game) */
  marketTrueValues?: Record<MarketId, number>;
  /** All markets have completed; GM must finalize P&L before ending game */
  allMarketsComplete?: boolean;
  /** P&L has been settled using true values; GM may now end game */
  pnlFinalized?: boolean;
  /** Max absolute position size per market (0 = no limit) */
  maxExposure?: number;
  createdAt: number;
}

// ---- Client -> Server events ----
export const ClientEvents = {
  JOIN_GAME: 'game:join',
  LEAVE_GAME: 'game:leave',
  SUBMIT_SPREAD: 'game:spread:submit',
  SUBMIT_MARKET_MAKER_QUOTE: 'game:mm:quote',
  SUBMIT_FORCED_TRADE: 'game:forced:trade',
  SUBMIT_ORDER: 'game:order:submit',
  CANCEL_ORDER: 'game:order:cancel',

  // Gamemaster only
  GM_CREATE_GAME: 'gm:create',
  GM_START_GAME: 'gm:start',
  GM_PAUSE_GAME: 'gm:pause',
  GM_RESUME_GAME: 'gm:resume',
  GM_STOP_GAME: 'gm:stop',
  GM_NEXT_STAGE: 'gm:next_stage',
  GM_PREV_STAGE: 'gm:prev_stage',
  GM_ADD_MARKET: 'gm:add_market',
  GM_ADD_DERIVATIVE: 'gm:add_derivative',
  GM_BROADCAST: 'gm:broadcast',
  GM_SET_TIMER: 'gm:set_timer',
  GM_SET_VISIBILITY: 'gm:set_visibility',
  GM_SET_TRUE_VALUE: 'gm:set_true_value',
  GM_SET_EXPOSURE_LIMIT: 'gm:set_exposure_limit',
  GM_FINALIZE_PNL: 'gm:finalize_pnl',
} as const;

// ---- Server -> Client events ----
export const ServerEvents = {
  JOINED: 'game:joined',
  JOIN_ERROR: 'game:join_error',
  STATE: 'game:state',
  STAGE_CHANGED: 'game:stage_changed',
  SPREAD_UPDATE: 'game:spread_update',
  ORDER_BOOK: 'game:order_book',
  TRADE: 'game:trade',
  ANNOUNCEMENT: 'game:announcement',
  TIMER: 'game:timer',
  PLAYER_LEFT: 'game:player_left',
  ERROR: 'game:error',
  GAME_ENDED: 'game:ended',
} as const;

// ---- Event payloads (client -> server) ----
export interface JoinGamePayload {
  gameCode: GameCode;
  displayName: string;
  isGamemaster?: boolean;
  gamemasterSecret?: string;
}

export interface SubmitSpreadPayload {
  spreadWidth: number;
}

export interface MarketMakerQuotePayload {
  bid: number;
  ask: number;
}

export interface ForcedTradePayload {
  direction: 'buy' | 'sell';
  quantity: number;
}

export interface SubmitOrderPayload {
  side: 'bid' | 'ask';
  price: number;
  quantity: number;
}

export interface CancelOrderPayload {
  orderId: OrderId;
}

export interface GmCreateGamePayload {
  gamemasterSecret: string;
  spreadTimerSeconds?: number;
  openTradingTimerSeconds?: number;
  noTighterWindowSeconds?: number;
}

export interface GmAddMarketPayload {
  name: string;
  description: string;
}

export interface GmAddDerivativePayload {
  name: string;
  description: string;
  underlyingWeights: Record<MarketId, number>;
  condition?: string;
}

export interface GmBroadcastPayload {
  text: string;
}

export interface GmSetTimerPayload {
  seconds: number;
}

export interface GmSetVisibilityPayload {
  showIndividualPositions: boolean;
}

export interface GmSetTrueValuePayload {
  marketId: MarketId;
  value: number;
}

export interface GmSetExposureLimitPayload {
  maxExposure: number;
}

// ---- Event payloads (server -> client) ----
export interface JoinedPayload {
  gameCode: GameCode;
  playerId: PlayerId;
  isGamemaster: boolean;
  state: GameState;
}

export interface StatePayload {
  state: GameState;
}

export interface StageChangedPayload {
  stage: RoundStage;
  round: RoundState;
  message?: string;
}

export interface SpreadUpdatePayload {
  bestSpread: number | null;
  bestSpreadPlayerId: PlayerId | null;
  submissions: SpreadSubmission[];
}

export interface TimerPayload {
  stage: RoundStage;
  endsAt: number;
  secondsRemaining: number;
}

export interface TradePayload {
  trade: Trade;
}

export interface AnnouncementPayload {
  id: string;
  text: string;
  at: number;
}

export interface GameEndedPayload {
  state: GameState;
  message: string;
}
