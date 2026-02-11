import { useState, useMemo } from "react";
import { useGame } from "../context/GameContext";
import { RoundStage } from "../types/game";
import { OrderBook } from "./OrderBook";
import { GamemasterPanel } from "./GamemasterPanel";

const STAGE_LABELS: Record<RoundStage, string> = {
	[RoundStage.SPREAD_QUOTING]: "Spread quoting",
	[RoundStage.MARKET_MAKER_QUOTE]: "Market maker quote",
	[RoundStage.FORCED_TRADING]: "Forced trading",
	[RoundStage.OPEN_TRADING]: "Open trading",
	[RoundStage.ROUND_END]: "Round end",
};

export function GameScreen() {
	const {
		state,
		playerId,
		gameCode,
		isGamemaster,
		timerRemaining,
		lastTrade,
		error,
		submitSpread,
		submitMarketMakerQuote,
		submitForcedTrade,
		submitOrder,
		leaveGame,
	} = useGame();

	const [spreadInput, setSpreadInput] = useState("");
	const [mmBid, setMmBid] = useState("");
	const [mmAsk, setMmAsk] = useState("");
	const [forcedDir, setForcedDir] = useState<"buy" | "sell">("buy");
	const [forcedQty, setForcedQty] = useState("");
	const [orderSide, setOrderSide] = useState<"bid" | "ask">("bid");
	const [orderPrice, setOrderPrice] = useState("");
	const [orderQty, setOrderQty] = useState("");
	const [showGm, setShowGm] = useState(false);

	const round = state?.round ?? null;
	const stage = round?.stage ?? null;
	const me = playerId && state ? state.players[playerId] : null;
	const market = state?.round?.marketId && state?.markets?.find((m) => m.id === state.round!.marketId);
	const isMM = me?.isMarketMaker ?? false;

	const leaderboard = useMemo(() => {
		if (!state) return [];
		return Object.values(state.players).sort((a, b) => b.totalPnl - a.totalPnl);
	}, [state]);

	if (!state || !gameCode) return null;

	return (
		<div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
			{/* Header */}
			<header className="border-b border-slate-800 bg-slate-900/80 px-4 py-3 flex flex-wrap items-center justify-between gap-2">
				<div className="flex items-center gap-4">
					<span className="font-mono text-emerald-400 font-semibold">{gameCode}</span>
					{stage != null && (
						<span className="text-slate-300">
							{STAGE_LABELS[stage]}
							{market && ` · ${market.name}`}
						</span>
					)}
					{state.status === "paused" && (
						<span className="rounded bg-amber-600/30 text-amber-400 px-2 py-0.5 text-sm">Paused</span>
					)}
				</div>
				<div className="flex items-center gap-3">
					{timerRemaining != null && timerRemaining >= 0 && (
						<span className="flex items-center gap-2">
							<span className="text-slate-500 text-sm">Time remaining:</span>
							<span className="font-mono text-lg text-amber-400 tabular-nums">{timerRemaining}s</span>
						</span>
					)}
					{state?.round && (state.round.stage === RoundStage.SPREAD_QUOTING || state.round.stage === RoundStage.OPEN_TRADING) && state.round.stageEndsAt == null && timerRemaining == null && (
						<span className="text-slate-500 text-sm">Waiting for GM to set timer</span>
					)}
					{me && (
						<span className="text-slate-400">
							{me.displayName}
							{me.isMarketMaker && " (MM)"}
							{isGamemaster && " · GM"}
						</span>
					)}
					<button
						type="button"
						onClick={leaveGame}
						className="text-sm text-slate-500 hover:text-red-400"
					>
						Leave
					</button>
				</div>
			</header>

			{error && (
				<div className="mx-4 mt-2 rounded-lg bg-red-950/50 border border-red-700/50 text-red-200 px-4 py-2 text-sm">
					{error}
				</div>
			)}

			<div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-4 p-4 overflow-auto">
				{/* Main: market visibility + stage + order form */}
				<div className="lg:col-span-2 space-y-4">
					{/* Market visibility: best spread (all players) or order book summary */}
					<div className="rounded-lg border border-slate-700 bg-slate-900/80 px-4 py-3">
						<h3 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">
							Market
						</h3>
						{stage === RoundStage.SPREAD_QUOTING && (
							<div className="space-y-1">
								<div className="flex items-center gap-2 flex-wrap">
									<span className="text-slate-400">Current best spread:</span>
									<span className="font-mono text-lg text-emerald-400">
										{round?.bestSpread != null ? round.bestSpread.toFixed(2) : "—"}
									</span>
									{round?.bestSpread != null && (
										<span className="text-slate-500 text-sm">
											(quote tighter to compete)
										</span>
									)}
								</div>
								{round?.bestSpreadPlayerId === playerId && (
									<div className="rounded bg-emerald-950/60 border border-emerald-700/50 text-emerald-300 text-sm font-medium px-2 py-1 inline-block">
										Your spread is currently leading
									</div>
								)}
							</div>
						)}
						{stage === RoundStage.OPEN_TRADING && (
							<div className="flex flex-wrap items-center gap-4 text-sm">
								{state.orderBook.lastTradePrice != null && (
									<span>
										<span className="text-slate-500">Last trade: </span>
										<span className="font-mono text-emerald-400">
											{state.orderBook.lastTradePrice.toFixed(2)}
										</span>
									</span>
								)}
								{state.orderBook.spread != null && (
									<span>
										<span className="text-slate-500">Spread: </span>
										<span className="font-mono">{state.orderBook.spread.toFixed(2)}</span>
									</span>
								)}
								<span className="text-slate-500">Order book in sidebar →</span>
							</div>
						)}
						{stage !== RoundStage.SPREAD_QUOTING && stage !== RoundStage.OPEN_TRADING && stage != null && (
							<span className="text-slate-400">{STAGE_LABELS[stage]}</span>
						)}
						{state.allMarketsComplete && (
							<div className="mt-2 rounded bg-amber-950/50 border border-amber-700/50 text-amber-200 text-sm px-2 py-1.5">
								All markets complete.
								{!state.pnlFinalized
									? " Gamemaster must finalize P&L before ending the game."
									: " P&L finalized. Gamemaster may end the game."}
							</div>
						)}
					</div>

					{/* Stage-specific actions (hidden for gamemaster) */}
					<div className="rounded-lg border border-slate-700 bg-slate-900/80 p-4">
						<h3 className="text-sm font-medium text-slate-400 mb-3">Actions</h3>
						{state.allMarketsComplete ? (
							<p className="text-slate-500">
								All markets have concluded. {state.pnlFinalized ? "P&L has been finalized. The gamemaster may end the game." : "Waiting for the gamemaster to finalize P&L before the game can end."}
							</p>
						) : isGamemaster ? (
							<p className="text-slate-500">
								You are the gamemaster. You do not trade. Use the <strong>Gamemaster</strong> button to
								control stages, timers, markets, and broadcasts.
							</p>
						) : (
							<>
						{stage === RoundStage.SPREAD_QUOTING && (
							<div className="flex flex-wrap items-end gap-3">
								<div>
									<label className="block text-xs text-slate-500 mb-1">Spread width</label>
									<input
										type="number"
										step="0.01"
										min="0.01"
										value={spreadInput}
										onChange={(e) => setSpreadInput(e.target.value)}
										placeholder={round?.bestSpread != null ? `≤ ${round.bestSpread}` : "e.g. 1.00"}
										className="rounded bg-slate-800 border border-slate-600 px-3 py-2 w-32 font-mono"
									/>
								</div>
								<button
									type="button"
									onClick={() => {
										const w = Number(spreadInput);
										if (Number.isFinite(w) && w > 0) submitSpread(w);
									}}
									className="rounded-lg bg-emerald-600 hover:bg-emerald-500 px-4 py-2 font-medium"
								>
									Submit spread
								</button>
								{round?.bestSpread != null && (
									<span className="text-slate-400 text-sm">
										Best: {round.bestSpread.toFixed(2)}
										{round.bestSpreadPlayerId === playerId && " (you)"}
									</span>
								)}
							</div>
						)}

						{stage === RoundStage.MARKET_MAKER_QUOTE && isMM && (
							<div className="flex flex-wrap items-end gap-3">
								<div>
									<label className="block text-xs text-slate-500 mb-1">Bid</label>
									<input
										type="number"
										step="0.01"
										value={mmBid}
										onChange={(e) => setMmBid(e.target.value)}
										className="rounded bg-slate-800 border border-slate-600 px-3 py-2 w-24 font-mono"
									/>
								</div>
								<div>
									<label className="block text-xs text-slate-500 mb-1">Ask</label>
									<input
										type="number"
										step="0.01"
										value={mmAsk}
										onChange={(e) => setMmAsk(e.target.value)}
										className="rounded bg-slate-800 border border-slate-600 px-3 py-2 w-24 font-mono"
									/>
								</div>
								<button
									type="button"
									onClick={() => {
										const b = Number(mmBid);
										const a = Number(mmAsk);
										if (Number.isFinite(b) && Number.isFinite(a) && a > b)
											submitMarketMakerQuote(b, a);
									}}
									className="rounded-lg bg-emerald-600 hover:bg-emerald-500 px-4 py-2 font-medium"
								>
									Quote
								</button>
								{round?.bestSpread != null && (
									<span className="text-slate-400 text-sm">Spread width: {round.bestSpread.toFixed(2)}</span>
								)}
							</div>
						)}

						{stage === RoundStage.MARKET_MAKER_QUOTE && !isMM && (
							<p className="text-slate-500">Waiting for market maker to quote bid/ask.</p>
						)}

						{stage === RoundStage.FORCED_TRADING && !isMM && (
							<div className="flex flex-wrap items-end gap-3">
								<select
									value={forcedDir}
									onChange={(e) => setForcedDir(e.target.value as "buy" | "sell")}
									className="rounded bg-slate-800 border border-slate-600 px-3 py-2"
								>
									<option value="buy">Buy</option>
									<option value="sell">Sell</option>
								</select>
								<div>
									<label className="block text-xs text-slate-500 mb-1">Quantity</label>
									<input
										type="number"
										min="1"
										value={forcedQty}
										onChange={(e) => setForcedQty(e.target.value)}
										className="rounded bg-slate-800 border border-slate-600 px-3 py-2 w-24 font-mono"
									/>
								</div>
								<button
									type="button"
									onClick={() => {
										const q = Number(forcedQty);
										if (Number.isInteger(q) && q > 0) submitForcedTrade(forcedDir, q);
									}}
									className="rounded-lg bg-emerald-600 hover:bg-emerald-500 px-4 py-2 font-medium"
								>
									Trade
								</button>
								{round?.marketMakerQuote && (
									<span className="text-slate-400 text-sm font-mono">
										Bid {round.marketMakerQuote.bid.toFixed(2)} / Ask {round.marketMakerQuote.ask.toFixed(2)}
									</span>
								)}
							</div>
						)}

						{stage === RoundStage.FORCED_TRADING && isMM && (
							<p className="text-slate-500">Waiting for others to complete forced trades.</p>
						)}

						{stage === RoundStage.OPEN_TRADING && (
							<div className="flex flex-wrap items-end gap-3">
								<select
									value={orderSide}
									onChange={(e) => setOrderSide(e.target.value as "bid" | "ask")}
									className="rounded bg-slate-800 border border-slate-600 px-3 py-2"
								>
									<option value="bid">Bid</option>
									<option value="ask">Ask</option>
								</select>
								<div>
									<label className="block text-xs text-slate-500 mb-1">Price</label>
									<input
										type="number"
										step="0.01"
										value={orderPrice}
										onChange={(e) => setOrderPrice(e.target.value)}
										className="rounded bg-slate-800 border border-slate-600 px-3 py-2 w-24 font-mono"
									/>
								</div>
								<div>
									<label className="block text-xs text-slate-500 mb-1">Qty</label>
									<input
										type="number"
										min="1"
										value={orderQty}
										onChange={(e) => setOrderQty(e.target.value)}
										className="rounded bg-slate-800 border border-slate-600 px-3 py-2 w-20 font-mono"
									/>
								</div>
								<button
									type="button"
									onClick={() => {
										const p = Number(orderPrice);
										const q = Number(orderQty);
										if (Number.isFinite(p) && p > 0 && Number.isInteger(q) && q > 0)
											submitOrder(orderSide, p, q);
									}}
									className="rounded-lg bg-emerald-600 hover:bg-emerald-500 px-4 py-2 font-medium"
								>
									Submit order
								</button>
							</div>
						)}

						{stage === RoundStage.ROUND_END && (
							<p className="text-slate-500">Round over. Gamemaster may advance to next round.</p>
						)}
							</>
						)}
					</div>

					{/* Last trade */}
					{lastTrade && (
						<div className="rounded-lg border border-slate-700 bg-slate-900/80 px-4 py-2 text-sm">
							<span className="text-slate-400">Last trade: </span>
							<span className="font-mono text-emerald-400">
								{lastTrade.quantity} @ {lastTrade.price.toFixed(2)}
							</span>
						</div>
					)}
				</div>

				{/* Sidebar: markets + order book + positions + leaderboard */}
				<div className="space-y-4">
					{/* All markets and descriptions (always visible) */}
					<div className="rounded-lg border border-slate-700 bg-slate-900/80 overflow-hidden">
						<div className="px-3 py-2 border-b border-slate-700 text-sm font-medium text-slate-400">
							Markets
						</div>
						<ul className="divide-y divide-slate-700 max-h-48 overflow-y-auto">
							{state.markets.map((m) => (
								<li key={m.id} className="px-3 py-2 text-sm">
									<div className="font-medium text-slate-200">{m.name}</div>
									{m.description && (
										<div className="text-slate-500 text-xs mt-0.5">{m.description}</div>
									)}
								</li>
							))}
							{state.markets.length === 0 && (
								<li className="px-3 py-2 text-slate-500 text-sm">No markets yet</li>
							)}
						</ul>
					</div>

					<OrderBook orderBook={state.orderBook} />

					{me && (
						<div className="rounded-lg border border-slate-700 bg-slate-900/80 overflow-hidden">
							<div className="px-3 py-2 border-b border-slate-700 text-sm text-slate-400">
								Your exposure
							</div>
							<div className="p-3 text-sm space-y-1">
								{!isGamemaster && (
									<div className="flex justify-between text-slate-500">
										<span>Cash</span>
										<span>—</span>
									</div>
								)}
								{isGamemaster && (
									<div className="flex justify-between">
										<span className="text-slate-400">Cash</span>
										<span className="font-mono text-emerald-400">{me.cash.toFixed(2)}</span>
									</div>
								)}
								{Object.values(me.positions).filter((p) => p.quantity !== 0).length > 0 ? (
									Object.values(me.positions)
										.filter((p) => p.quantity !== 0)
										.map((p) => {
											const market = state.markets.find((m) => m.id === p.marketId);
											return (
												<div key={p.marketId} className="flex justify-between font-mono">
													<span className="truncate" title={market?.name ?? p.marketId}>
														{market?.name ?? `${p.marketId.slice(0, 8)}…`}
													</span>
													<span className={p.quantity > 0 ? "text-emerald-400" : "text-red-400"}>
														{p.quantity}
													</span>
												</div>
											);
										})
								) : (
									<div className="text-slate-500">No exposure</div>
								)}
								<div className="flex justify-between pt-1 border-t border-slate-700">
									<span className="text-slate-400">Your P&L</span>
									<span
										className={`font-mono ${me.totalPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}
									>
										{me.totalPnl >= 0 ? "+" : ""}
										{me.totalPnl.toFixed(2)}
									</span>
								</div>
							</div>
						</div>
					)}

					<div className="rounded-lg border border-slate-700 bg-slate-900/80 overflow-hidden">
						<div className="px-3 py-2 border-b border-slate-700 text-sm text-slate-400">
							Global P&L (all players)
						</div>
						<ul className="divide-y divide-slate-700">
							{leaderboard.map((p, i) => (
								<li
									key={p.id}
									className={`px-3 py-2 flex justify-between text-sm ${
										p.id === playerId ? "bg-slate-800/50" : ""
									}`}
								>
									<span>
										{i + 1}. {p.displayName}
										{p.id === playerId && " (you)"}
										{p.isMarketMaker && " (MM)"}
									</span>
									<span
										className={`font-mono ${
											p.totalPnl >= 0 ? "text-emerald-400" : "text-red-400"
										}`}
									>
										{p.totalPnl >= 0 ? "+" : ""}
										{p.totalPnl.toFixed(2)}
									</span>
								</li>
							))}
						</ul>
					</div>

					{state.announcements.length > 0 && (
						<div className="rounded-lg border border-slate-700 bg-slate-900/80 overflow-hidden">
							<div className="px-3 py-2 border-b border-slate-700 text-sm text-slate-400">
								Announcements
							</div>
							<ul className="p-3 space-y-2 max-h-40 overflow-y-auto text-sm text-slate-300">
								{state.announcements.slice().reverse().map((a) => (
									<li key={a.id}>{a.text}</li>
								))}
							</ul>
						</div>
					)}
				</div>
			</div>

			{isGamemaster && (
				<>
					<button
						type="button"
						onClick={() => setShowGm((x) => !x)}
						className="fixed bottom-4 right-4 rounded-full bg-amber-600 hover:bg-amber-500 text-white px-4 py-2 text-sm font-medium shadow-lg"
					>
						{showGm ? "Hide" : "Gamemaster"}
					</button>
					{showGm && <GamemasterPanel onClose={() => setShowGm(false)} />}
				</>
			)}
		</div>
	);
}
