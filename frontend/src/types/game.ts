/**
 * Frontend types mirroring backend game state and events.
 */

export type GameCode = string;
export type PlayerId = string;
export type MarketId = string;
export type OrderId = string;
export type RoundIndex = number;

export enum RoundStage {
	SPREAD_QUOTING = "SPREAD_QUOTING",
	MARKET_MAKER_QUOTE = "MARKET_MAKER_QUOTE",
	FORCED_TRADING = "FORCED_TRADING",
	OPEN_TRADING = "OPEN_TRADING",
	ROUND_END = "ROUND_END",
}

export interface Market {
	id: MarketId;
	name: string;
	description: string;
	underlyingWeights?: Record<MarketId, number>;
	condition?: string;
}

export interface OrderLevel {
	price: number;
	quantity: number;
	playerIds: string[];
}

export interface OrderBookSnapshot {
	bids: OrderLevel[];
	asks: OrderLevel[];
	lastTradePrice?: number;
	spread?: number;
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

export interface PlayerPosition {
	marketId: MarketId;
	quantity: number;
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
	bestSpread: number | null;
	bestSpreadPlayerId: PlayerId | null;
	spreadSubmissions: SpreadSubmission[];
	marketMakerQuote: MarketMakerQuote | null;
	stageEndsAt: number | null;
	noTighterUntil?: number;
}

export type GameStatus = "lobby" | "playing" | "paused" | "stopped";

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
	showIndividualPositions: boolean;
	announcements: Array< { id: string; text: string; at: number }>;
	/** Gamemaster-only: true value per market */
	marketTrueValues?: Record<MarketId, number>;
	/** All markets have completed; GM must finalize P&L before ending game */
	allMarketsComplete?: boolean;
	/** P&L has been settled using true values; GM may now end game */
	pnlFinalized?: boolean;
	/** Max absolute position size per market (0 = no limit) */
	maxExposure?: number;
	createdAt: number;
}

export const ClientEvents = {
	JOIN_GAME: "game:join",
	LEAVE_GAME: "game:leave",
	SUBMIT_SPREAD: "game:spread:submit",
	SUBMIT_MARKET_MAKER_QUOTE: "game:mm:quote",
	SUBMIT_FORCED_TRADE: "game:forced:trade",
	SUBMIT_ORDER: "game:order:submit",
	CANCEL_ORDER: "game:order:cancel",
	GM_CREATE_GAME: "gm:create",
	GM_START_GAME: "gm:start",
	GM_PAUSE_GAME: "gm:pause",
	GM_RESUME_GAME: "gm:resume",
	GM_STOP_GAME: "gm:stop",
	GM_NEXT_STAGE: "gm:next_stage",
	GM_PREV_STAGE: "gm:prev_stage",
	GM_ADD_MARKET: "gm:add_market",
	GM_ADD_DERIVATIVE: "gm:add_derivative",
	GM_BROADCAST: "gm:broadcast",
	GM_SET_TIMER: "gm:set_timer",
	GM_SET_VISIBILITY: "gm:set_visibility",
	GM_SET_TRUE_VALUE: "gm:set_true_value",
	GM_SET_EXPOSURE_LIMIT: "gm:set_exposure_limit",
	GM_FINALIZE_PNL: "gm:finalize_pnl",
} as const;

export const ServerEvents = {
	JOINED: "game:joined",
	JOIN_ERROR: "game:join_error",
	STATE: "game:state",
	STAGE_CHANGED: "game:stage_changed",
	SPREAD_UPDATE: "game:spread_update",
	ORDER_BOOK: "game:order_book",
	TRADE: "game:trade",
	ANNOUNCEMENT: "game:announcement",
	TIMER: "game:timer",
	PLAYER_LEFT: "game:player_left",
	ERROR: "game:error",
	GAME_ENDED: "game:ended",
} as const;
