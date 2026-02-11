import { io } from "socket.io-client";
import { ClientEvents, ServerEvents } from "../types/game";
import type {
	GameState,
	JoinedPayload,
	StatePayload,
	StageChangedPayload,
	SpreadUpdatePayload,
	TimerPayload,
	TradePayload,
	AnnouncementPayload,
} from "../types/game";

const SOCKET_URL = import.meta.env.DEV
	? "http://localhost:3000"
	: (import.meta.env.VITE_WS_URL ?? "");

export function createSocket() {
	return io(SOCKET_URL, {
		autoConnect: false,
		transports: ["websocket", "polling"],
	});
}

export type Socket = ReturnType<typeof createSocket>;

export function joinGame(
	socket: Socket,
	payload: { gameCode: string; displayName: string; isGamemaster?: boolean; gamemasterSecret?: string },
): Promise<JoinedPayload | { error: string }> {
	return new Promise((resolve) => {
		socket.emit(ClientEvents.JOIN_GAME, payload, (res: JoinedPayload | { error: string }) => resolve(res));
	});
}

export function leaveGame(socket: Socket): void {
	socket.emit(ClientEvents.LEAVE_GAME);
}

export function submitSpread(socket: Socket, spreadWidth: number): void {
	socket.emit(ClientEvents.SUBMIT_SPREAD, { spreadWidth });
}

export function submitMarketMakerQuote(socket: Socket, bid: number, ask: number): void {
	socket.emit(ClientEvents.SUBMIT_MARKET_MAKER_QUOTE, { bid, ask });
}

export function submitForcedTrade(socket: Socket, direction: "buy" | "sell", quantity: number): void {
	socket.emit(ClientEvents.SUBMIT_FORCED_TRADE, { direction, quantity });
}

export function submitOrder(
	socket: Socket,
	side: "bid" | "ask",
	price: number,
	quantity: number,
): void {
	socket.emit(ClientEvents.SUBMIT_ORDER, { side, price, quantity });
}

export function gmCreateGame(
	socket: Socket,
	payload: {
		gamemasterSecret: string;
		spreadTimerSeconds?: number;
		openTradingTimerSeconds?: number;
		noTighterWindowSeconds?: number;
	},
): Promise<{ gameCode?: string; error?: string }> {
	return new Promise((resolve) => {
		socket.emit(ClientEvents.GM_CREATE_GAME, payload, (res: { gameCode?: string; error?: string }) =>
			resolve(res ?? {}),
		);
	});
}

export function gmStartGame(socket: Socket): void {
	socket.emit(ClientEvents.GM_START_GAME);
}

export function gmPauseGame(socket: Socket): void {
	socket.emit(ClientEvents.GM_PAUSE_GAME);
}

export function gmResumeGame(socket: Socket): void {
	socket.emit(ClientEvents.GM_RESUME_GAME);
}

export function gmStopGame(socket: Socket): void {
	socket.emit(ClientEvents.GM_STOP_GAME);
}

export function gmNextStage(socket: Socket): void {
	socket.emit(ClientEvents.GM_NEXT_STAGE);
}

export function gmPrevStage(socket: Socket): void {
	socket.emit(ClientEvents.GM_PREV_STAGE);
}

export function gmAddMarket(socket: Socket, name: string, description: string): void {
	socket.emit(ClientEvents.GM_ADD_MARKET, { name, description });
}

export function gmAddDerivative(
	socket: Socket,
	payload: { name: string; description: string; underlyingWeights: Record<string, number>; condition?: string },
): void {
	socket.emit(ClientEvents.GM_ADD_DERIVATIVE, payload);
}

export function gmBroadcast(socket: Socket, text: string): void {
	socket.emit(ClientEvents.GM_BROADCAST, { text });
}

export function gmSetTimer(socket: Socket, seconds: number): void {
	socket.emit(ClientEvents.GM_SET_TIMER, { seconds });
}

export function gmSetVisibility(socket: Socket, showIndividualPositions: boolean): void {
	socket.emit(ClientEvents.GM_SET_VISIBILITY, { showIndividualPositions });
}

export function gmSetTrueValue(socket: Socket, marketId: string, value: number): void {
	socket.emit(ClientEvents.GM_SET_TRUE_VALUE, { marketId, value });
}

export function gmSetExposureLimit(socket: Socket, maxExposure: number): void {
	socket.emit(ClientEvents.GM_SET_EXPOSURE_LIMIT, { maxExposure });
}

export function gmFinalizePnl(socket: Socket): void {
	socket.emit(ClientEvents.GM_FINALIZE_PNL);
}

export type GameEndedPayload = { state: GameState; message: string };

export type GameStateListeners = {
	onJoined?: (payload: JoinedPayload) => void;
	onState?: (state: GameState) => void;
	onStageChanged?: (payload: StageChangedPayload) => void;
	onSpreadUpdate?: (payload: SpreadUpdatePayload) => void;
	onOrderBook?: (orderBook: GameState["orderBook"]) => void;
	onTrade?: (payload: TradePayload) => void;
	onAnnouncement?: (payload: AnnouncementPayload) => void;
	onTimer?: (payload: TimerPayload) => void;
	onPlayerLeft?: (payload: { playerId: string; displayName?: string }) => void;
	onError?: (payload: { message: string }) => void;
	onGameEnded?: (payload: GameEndedPayload) => void;
};

export function bindGameListeners(socket: Socket, listeners: GameStateListeners): () => void {
	const off: Array<() => void> = [];
	if (listeners.onJoined) {
		socket.on(ServerEvents.JOINED, listeners.onJoined);
		off.push(() => socket.off(ServerEvents.JOINED));
	}
	if (listeners.onState) {
		socket.on(ServerEvents.STATE, (p: StatePayload) => listeners.onState?.(p.state));
		off.push(() => socket.off(ServerEvents.STATE));
	}
	if (listeners.onStageChanged) {
		socket.on(ServerEvents.STAGE_CHANGED, listeners.onStageChanged);
		off.push(() => socket.off(ServerEvents.STAGE_CHANGED));
	}
	if (listeners.onSpreadUpdate) {
		socket.on(ServerEvents.SPREAD_UPDATE, listeners.onSpreadUpdate);
		off.push(() => socket.off(ServerEvents.SPREAD_UPDATE));
	}
	if (listeners.onOrderBook) {
		socket.on(ServerEvents.ORDER_BOOK, (p: { orderBook: GameState["orderBook"] }) =>
			listeners.onOrderBook?.(p.orderBook),
		);
		off.push(() => socket.off(ServerEvents.ORDER_BOOK));
	}
	if (listeners.onTrade) {
		socket.on(ServerEvents.TRADE, listeners.onTrade);
		off.push(() => socket.off(ServerEvents.TRADE));
	}
	if (listeners.onAnnouncement) {
		socket.on(ServerEvents.ANNOUNCEMENT, listeners.onAnnouncement);
		off.push(() => socket.off(ServerEvents.ANNOUNCEMENT));
	}
	if (listeners.onTimer) {
		socket.on(ServerEvents.TIMER, listeners.onTimer);
		off.push(() => socket.off(ServerEvents.TIMER));
	}
	if (listeners.onPlayerLeft) {
		socket.on(ServerEvents.PLAYER_LEFT, listeners.onPlayerLeft);
		off.push(() => socket.off(ServerEvents.PLAYER_LEFT));
	}
	if (listeners.onError) {
		socket.on(ServerEvents.ERROR, listeners.onError);
		off.push(() => socket.off(ServerEvents.ERROR));
	}
	if (listeners.onGameEnded) {
		socket.on(ServerEvents.GAME_ENDED, listeners.onGameEnded);
		off.push(() => socket.off(ServerEvents.GAME_ENDED));
	}
	return () => off.forEach((f) => f());
}
