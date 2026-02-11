import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
	type ReactNode,
} from "react";
import { createSocket, bindGameListeners, joinGame as apiJoinGame, leaveGame as apiLeaveGame } from "../lib/socket";
import type { GameState, JoinedPayload, TimerPayload, TradePayload } from "../types/game";
import type { Socket } from "../lib/socket";
import * as api from "../lib/socket";

interface GameContextValue {
	connected: boolean;
	playerId: string | null;
	gameCode: string | null;
	isGamemaster: boolean;
	state: GameState | null;
	timerRemaining: number | null;
	lastTrade: TradePayload["trade"] | null;
	error: string | null;
	joinGame: (gameCode: string, displayName: string, gamemasterSecret?: string) => Promise<string | null>;
	createGame: (gamemasterSecret: string, options?: {
		spreadTimerSeconds?: number;
		openTradingTimerSeconds?: number;
		noTighterWindowSeconds?: number;
	}) => Promise<string | null>;
	leaveGame: () => void;
	submitSpread: (spreadWidth: number) => void;
	submitMarketMakerQuote: (bid: number, ask: number) => void;
	submitForcedTrade: (direction: "buy" | "sell", quantity: number) => void;
	submitOrder: (side: "bid" | "ask", price: number, quantity: number) => void;
	gmStartGame: () => void;
	gmPauseGame: () => void;
	gmResumeGame: () => void;
	gmStopGame: () => void;
	gmNextStage: () => void;
	gmPrevStage: () => void;
	gmAddMarket: (name: string, description: string) => void;
	gmAddDerivative: (payload: {
		name: string;
		description: string;
		underlyingWeights: Record<string, number>;
		condition?: string;
	}) => void;
	gmBroadcast: (text: string) => void;
	gmSetTimer: (seconds: number) => void;
	gmSetVisibility: (show: boolean) => void;
	gmSetTrueValue: (marketId: string, value: number) => void;
	gmSetExposureLimit: (maxExposure: number) => void;
	gmFinalizePnl: () => void;
	socket: Socket | null;
	/** Set when game is ended by GM; final state and message */
	gameEnded: { state: GameState; message: string } | null;
}

const GameContext = createContext<GameContextValue | null>(null);

export function GameProvider({ children }: { children: ReactNode }) {
	const [socket, setSocket] = useState<Socket | null>(null);
	const [connected, setConnected] = useState(false);
	const [playerId, setPlayerId] = useState<string | null>(null);
	const [gameCode, setGameCode] = useState<string | null>(null);
	const [isGamemaster, setIsGamemaster] = useState(false);
	const [state, setState] = useState<GameState | null>(null);
	const [timerRemaining, setTimerRemaining] = useState<number | null>(null);
	const [lastTrade, setLastTrade] = useState<TradePayload["trade"] | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [gameEnded, setGameEnded] = useState<{ state: GameState; message: string } | null>(null);
	const socketRef = useRef<Socket | null>(null);

	useEffect(() => {
		const s = createSocket();
		socketRef.current = s;
		setSocket(s);
		s.on("connect", () => setConnected(true));
		s.on("disconnect", () => {
			setConnected(false);
			setPlayerId(null);
			setGameCode(null);
			setState(null);
		});
		s.connect();
		return () => {
			s.disconnect();
			socketRef.current = null;
		};
	}, []);

	useEffect(() => {
		const s = socketRef.current;
		if (!s) return;
		const unbind = bindGameListeners(s, {
			onJoined: (payload: JoinedPayload) => {
				setPlayerId(payload.playerId);
				setGameCode(payload.gameCode);
				setIsGamemaster(payload.isGamemaster);
				setState(payload.state);
				setError(null);
			},
			onState: (newState) => setState(newState),
			onStageChanged: (payload) => {
				setState((prev) => {
					if (!prev) return prev;
					return { ...prev, round: payload.round };
				});
				if (payload.round?.stageEndsAt != null) {
					const secRem = Math.max(0, Math.ceil((payload.round.stageEndsAt - Date.now()) / 1000));
					setTimerRemaining(secRem);
				} else {
					setTimerRemaining(null);
				}
			},
			onSpreadUpdate: (payload) => {
				setState((prev) => {
					if (!prev?.round) return prev;
					return {
						...prev,
						round: {
							...prev.round,
							bestSpread: payload.bestSpread,
							bestSpreadPlayerId: payload.bestSpreadPlayerId,
							spreadSubmissions: payload.submissions,
						},
					};
				});
			},
			onTimer: (p: TimerPayload) => {
				setTimerRemaining(p.secondsRemaining);
				setState((prev) => {
					if (!prev?.round || prev.round.stage !== p.stage) return prev;
					return { ...prev, round: { ...prev.round, stageEndsAt: p.endsAt } };
				});
			},
			onTrade: (p: TradePayload) => setLastTrade(p.trade),
			onError: (p) => setError(p.message),
			onGameEnded: (p) => {
				setGameEnded({ state: p.state, message: p.message });
				setState(p.state);
			},
		});
		return unbind;
	}, []);

	const joinGame = useCallback(
		async (code: string, displayName: string, gamemasterSecret?: string) => {
			const s = socketRef.current;
			if (!s?.connected) return null;
			const res = await apiJoinGame(s, {
				gameCode: code.toUpperCase(),
				displayName,
				isGamemaster: Boolean(gamemasterSecret),
				gamemasterSecret,
			});
			if ("error" in res) {
				setError(res.error);
				return null;
			}
			// Server returns JoinedPayload in ack (no JOINED emit for joining player) – set state from response
			setPlayerId(res.playerId);
			setGameCode(res.gameCode);
			setIsGamemaster(res.isGamemaster);
			setState(res.state);
			setError(null);
			return res.gameCode;
		},
		[],
	);

	const createGame = useCallback(
		async (
			secret: string,
			options?: {
				spreadTimerSeconds?: number;
				openTradingTimerSeconds?: number;
				noTighterWindowSeconds?: number;
			},
		) => {
			const s = socketRef.current;
			if (!s?.connected) return null;
			const res = await api.gmCreateGame(s, {
				gamemasterSecret: secret,
				...options,
			});
			if (res.error) {
				setError(res.error);
				return null;
			}
			return res.gameCode ?? null;
		},
		[],
	);

	const leaveGame = useCallback(() => {
		const s = socketRef.current;
		if (s) apiLeaveGame(s);
		setPlayerId(null);
		setGameCode(null);
		setIsGamemaster(false);
		setState(null);
		setTimerRemaining(null);
		setLastTrade(null);
		setGameEnded(null);
	}, []);

	const value = useMemo<GameContextValue>(
		() => ({
			connected,
			playerId,
			gameCode,
			isGamemaster,
			state,
			timerRemaining,
			lastTrade,
			error,
			socket: socketRef.current,
			joinGame,
			createGame,
			leaveGame,
			submitSpread: (w) => socketRef.current?.emit("game:spread:submit", { spreadWidth: w }),
			submitMarketMakerQuote: (bid, ask) =>
				socketRef.current?.emit("game:mm:quote", { bid, ask }),
			submitForcedTrade: (dir, qty) =>
				socketRef.current?.emit("game:forced:trade", { direction: dir, quantity: qty }),
			submitOrder: (side, price, qty) =>
				socketRef.current?.emit("game:order:submit", { side, price, quantity: qty }),
			gmStartGame: () => socketRef.current?.emit("gm:start"),
			gmPauseGame: () => socketRef.current?.emit("gm:pause"),
			gmResumeGame: () => socketRef.current?.emit("gm:resume"),
			gmStopGame: () => socketRef.current?.emit("gm:stop"),
			gmNextStage: () => socketRef.current?.emit("gm:next_stage"),
			gmPrevStage: () => socketRef.current?.emit("gm:prev_stage"),
			gmAddMarket: (name, desc) => socketRef.current?.emit("gm:add_market", { name, description: desc }),
			gmAddDerivative: (payload) => socketRef.current?.emit("gm:add_derivative", payload),
			gmBroadcast: (text) => socketRef.current?.emit("gm:broadcast", { text }),
			gmSetTimer: (sec) => socketRef.current?.emit("gm:set_timer", { seconds: sec }),
			gmSetVisibility: (show) =>
				socketRef.current?.emit("gm:set_visibility", { showIndividualPositions: show }),
			gmSetTrueValue: (marketId, value) =>
				socketRef.current?.emit("gm:set_true_value", { marketId, value }),
			gmSetExposureLimit: (max) =>
				socketRef.current?.emit("gm:set_exposure_limit", { maxExposure: max }),
			gmFinalizePnl: () => socketRef.current?.emit("gm:finalize_pnl"),
			gameEnded,
		}),
		[
			connected,
			playerId,
			gameCode,
			isGamemaster,
			state,
			timerRemaining,
			lastTrade,
			error,
			gameEnded,
			joinGame,
			createGame,
			leaveGame,
		],
	);

	return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame() {
	const ctx = useContext(GameContext);
	if (!ctx) throw new Error("useGame must be used within GameProvider");
	return ctx;
}
