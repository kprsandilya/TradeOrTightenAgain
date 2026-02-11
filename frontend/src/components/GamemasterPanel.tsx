import { useState } from "react";
import { useGame } from "../context/GameContext";
import { RoundStage } from "../types/game";

const STAGE_LABELS: Record<RoundStage, string> = {
	[RoundStage.SPREAD_QUOTING]: "Spread quoting",
	[RoundStage.MARKET_MAKER_QUOTE]: "Market maker quote",
	[RoundStage.FORCED_TRADING]: "Forced trading",
	[RoundStage.OPEN_TRADING]: "Open trading",
	[RoundStage.ROUND_END]: "Round end",
};

interface Props {
	onClose: () => void;
}

export function GamemasterPanel({ onClose }: Props) {
	const {
		state,
		gmStartGame,
		gmPauseGame,
		gmResumeGame,
		gmStopGame,
		gmNextStage,
		gmPrevStage,
		gmAddMarket,
		gmAddDerivative,
		gmBroadcast,
		gmSetTimer,
		gmSetVisibility,
		gmSetTrueValue,
		gmSetExposureLimit,
		gmFinalizePnl,
	} = useGame();

	const [marketName, setMarketName] = useState("");
	const [marketDesc, setMarketDesc] = useState("");
	const [broadcastText, setBroadcastText] = useState("");
	const [timerSec, setTimerSec] = useState("60");
	const [derivName, setDerivName] = useState("");
	const [derivDesc, setDerivDesc] = useState("");
	const [derivWeights, setDerivWeights] = useState("");
	const [trueValueInputs, setTrueValueInputs] = useState<Record<string, string>>({});
	const [exposureLimitInput, setExposureLimitInput] = useState("");

	if (!state) return null;

	const canStart = state.status === "lobby" && state.markets.length > 0;
	const currentMarket = state.round?.marketId && state.markets.find((m) => m.id === state.round!.marketId);
	const playersList = Object.values(state.players).filter((p) => !p.isGamemaster);

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
			<div className="bg-slate-900 border border-slate-700 rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
				<div className="sticky top-0 bg-slate-900 border-b border-slate-700 px-4 py-3 flex justify-between items-center">
					<h2 className="text-lg font-semibold text-amber-400">Gamemaster controls</h2>
					<button
						type="button"
						onClick={onClose}
						className="text-slate-400 hover:text-white"
					>
						✕
					</button>
				</div>
				<div className="p-4 space-y-6">
					{/* Current stage & market (GM view) */}
					<section className="rounded-lg bg-slate-800/50 p-3">
						<h3 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">
							Current game stage
						</h3>
						<div className="text-sm space-y-1">
							<div>
								<span className="text-slate-400">Stage: </span>
								<span className="text-amber-400 font-medium">
									{state.round ? STAGE_LABELS[state.round.stage] : "—"}
								</span>
							</div>
							<div>
								<span className="text-slate-400">Active market: </span>
								<span>{currentMarket ? currentMarket.name : "—"}</span>
							</div>
							<div>
								<span className="text-slate-400">Markets: </span>
								<span>
									{state.markets.map((m) => m.name).join(", ") || "None"}
								</span>
							</div>
						</div>
					</section>

					{/* Lifecycle */}
					<section>
						<h3 className="text-sm font-medium text-slate-400 mb-2">Game lifecycle</h3>
						<div className="flex flex-wrap gap-2">
							{state.status === "lobby" && (
								<button
									type="button"
									onClick={gmStartGame}
									disabled={!canStart}
									className="rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-3 py-2 text-sm font-medium"
								>
									Start game
								</button>
							)}
							{state.status === "playing" && (
								<>
									<button
										type="button"
										onClick={gmPauseGame}
										className="rounded-lg bg-amber-600 hover:bg-amber-500 px-3 py-2 text-sm font-medium"
									>
										Pause
									</button>
								</>
							)}
							{state.status === "paused" && (
								<button
									type="button"
									onClick={gmResumeGame}
									className="rounded-lg bg-emerald-600 hover:bg-emerald-500 px-3 py-2 text-sm font-medium"
								>
									Resume
								</button>
							)}
							{(state.status === "playing" || state.status === "paused") && (
								<button
									type="button"
									onClick={gmStopGame}
									disabled={state.allMarketsComplete && !state.pnlFinalized}
									title={state.allMarketsComplete && !state.pnlFinalized ? "Finalize P&L first" : undefined}
									className="rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed px-3 py-2 text-sm font-medium"
								>
									End game
								</button>
							)}
						</div>
						{state.status === "lobby" && state.markets.length === 0 && (
							<p className="mt-2 text-xs text-slate-500">Add at least one market to start.</p>
						)}
						{state.allMarketsComplete && !state.pnlFinalized && (
							<p className="mt-2 text-xs text-amber-400">Finalize P&L below before you can end the game.</p>
						)}
					</section>

					{/* Stage */}
					<section>
						<h3 className="text-sm font-medium text-slate-400 mb-2">Stage</h3>
						<div className="flex gap-2">
							<button
								type="button"
								onClick={gmPrevStage}
								className="rounded-lg bg-slate-700 hover:bg-slate-600 px-3 py-2 text-sm font-medium"
							>
								← Previous
							</button>
							<button
								type="button"
								onClick={gmNextStage}
								className="rounded-lg bg-slate-700 hover:bg-slate-600 px-3 py-2 text-sm font-medium"
							>
								Next →
							</button>
						</div>
					</section>

					{/* Add market */}
					<section>
						<h3 className="text-sm font-medium text-slate-400 mb-2">Add market</h3>
						{state.status === "lobby" && (
							<p className="text-xs text-slate-500 mb-2">
								Add at least one market, then click Start game above to begin. The first market will become active.
							</p>
						)}
						<div className="space-y-2">
							<input
								type="text"
								value={marketName}
								onChange={(e) => setMarketName(e.target.value)}
								placeholder="Market name"
								className="w-full rounded-lg bg-slate-800 border border-slate-600 px-3 py-2 text-sm"
							/>
							<input
								type="text"
								value={marketDesc}
								onChange={(e) => setMarketDesc(e.target.value)}
								placeholder="Description (e.g. asset payoff)"
								className="w-full rounded-lg bg-slate-800 border border-slate-600 px-3 py-2 text-sm"
							/>
							<button
								type="button"
								onClick={() => {
									if (marketName.trim()) {
										gmAddMarket(marketName.trim(), marketDesc.trim());
										setMarketName("");
										setMarketDesc("");
									}
								}}
								className="rounded-lg bg-slate-700 hover:bg-slate-600 px-3 py-2 text-sm font-medium"
							>
								Add market
							</button>
						</div>
					</section>

					{/* Add derivative (if we have markets) */}
					{state.markets.length > 0 && (
						<section>
							<h3 className="text-sm font-medium text-slate-400 mb-2">Add derivative</h3>
							<div className="space-y-2">
								<input
									type="text"
									value={derivName}
									onChange={(e) => setDerivName(e.target.value)}
									placeholder="Derivative name"
									className="w-full rounded-lg bg-slate-800 border border-slate-600 px-3 py-2 text-sm"
								/>
								<input
									type="text"
									value={derivDesc}
									onChange={(e) => setDerivDesc(e.target.value)}
									placeholder="Description"
									className="w-full rounded-lg bg-slate-800 border border-slate-600 px-3 py-2 text-sm"
								/>
								<input
									type="text"
									value={derivWeights}
									onChange={(e) => setDerivWeights(e.target.value)}
									placeholder='Weights JSON e.g. {"market-id-1": 1, "market-id-2": -0.5}'
									className="w-full rounded-lg bg-slate-800 border border-slate-600 px-3 py-2 text-sm font-mono"
								/>
								<button
									type="button"
									onClick={() => {
										if (derivName.trim() && derivWeights.trim()) {
											try {
												const weights = JSON.parse(derivWeights) as Record<string, number>;
												gmAddDerivative({
													name: derivName.trim(),
													description: derivDesc.trim(),
													underlyingWeights: weights,
												});
												setDerivName("");
												setDerivDesc("");
												setDerivWeights("");
											} catch {
												// invalid JSON
											}
										}
									}}
									className="rounded-lg bg-slate-700 hover:bg-slate-600 px-3 py-2 text-sm font-medium"
								>
									Add derivative
								</button>
							</div>
						</section>
					)}

					{/* Broadcast */}
					<section>
						<h3 className="text-sm font-medium text-slate-400 mb-2">Broadcast message</h3>
						<div className="flex gap-2">
							<input
								type="text"
								value={broadcastText}
								onChange={(e) => setBroadcastText(e.target.value)}
								placeholder="News, hints, clarification…"
								className="flex-1 rounded-lg bg-slate-800 border border-slate-600 px-3 py-2 text-sm"
							/>
							<button
								type="button"
								onClick={() => {
									if (broadcastText.trim()) {
										gmBroadcast(broadcastText.trim());
										setBroadcastText("");
									}
								}}
								className="rounded-lg bg-slate-700 hover:bg-slate-600 px-3 py-2 text-sm font-medium"
							>
								Send
							</button>
						</div>
					</section>

					{/* Exposure limit */}
					<section>
						<h3 className="text-sm font-medium text-slate-400 mb-2">Position exposure limit</h3>
						<p className="text-xs text-slate-500 mb-2">
							Max absolute position size per market (0 = no limit). Applied to all players.
						</p>
						<div className="flex gap-2">
							<input
								type="number"
								min={0}
								value={exposureLimitInput}
								onChange={(e) => setExposureLimitInput(e.target.value)}
								placeholder={state.maxExposure ? String(state.maxExposure) : "0 = no limit"}
								className="w-28 rounded-lg bg-slate-800 border border-slate-600 px-3 py-2 text-sm"
							/>
							<button
								type="button"
								onClick={() => {
									const v = Number(exposureLimitInput);
									if (Number.isInteger(v) && v >= 0) {
										gmSetExposureLimit(v);
										setExposureLimitInput("");
									}
								}}
								className="rounded-lg bg-slate-700 hover:bg-slate-600 px-3 py-2 text-sm font-medium"
							>
								Set
							</button>
							{state.maxExposure != null && state.maxExposure > 0 && (
								<span className="text-slate-500 text-sm self-center">Current: {state.maxExposure}</span>
							)}
						</div>
					</section>

					{/* Finalize P&L (only when all markets complete) */}
					{state.allMarketsComplete && (
						<section>
							<h3 className="text-sm font-medium text-slate-400 mb-2">Finalize P&L</h3>
							<p className="text-xs text-slate-500 mb-2">
								Calculate and lock P&L using true values. Required before ending the game.
							</p>
							<button
								type="button"
								onClick={gmFinalizePnl}
								disabled={state.pnlFinalized}
								className="rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-3 py-2 text-sm font-medium"
							>
								{state.pnlFinalized ? "P&L finalized" : "Finalize P&L"}
							</button>
						</section>
					)}

					{/* Timer */}
					<section>
						<h3 className="text-sm font-medium text-slate-400 mb-2">Set timer (seconds)</h3>
						<p className="text-xs text-slate-500 mb-2">
							Works in Spread quoting and Open trading. Enter seconds (1–3600) and click Set to start or change the countdown.
						</p>
						<div className="flex gap-2">
							<input
								type="number"
								min={1}
								max={3600}
								value={timerSec}
								onChange={(e) => setTimerSec(e.target.value)}
								className="w-24 rounded-lg bg-slate-800 border border-slate-600 px-3 py-2 text-sm"
							/>
							<button
								type="button"
								onClick={() => {
									const sec = Math.max(1, Math.min(3600, Number(timerSec) || 60));
									gmSetTimer(sec);
									setTimerSec(String(sec));
								}}
								disabled={!state.round || (state.round.stage !== RoundStage.SPREAD_QUOTING && state.round.stage !== RoundStage.OPEN_TRADING)}
								title={state.round && state.round.stage !== RoundStage.SPREAD_QUOTING && state.round.stage !== RoundStage.OPEN_TRADING ? "Timer only applies in Spread quoting or Open trading" : undefined}
								className="rounded-lg bg-slate-700 hover:bg-slate-600 disabled:opacity-50 px-3 py-2 text-sm font-medium"
							>
								Set
							</button>
						</div>
					</section>

					{/* True values (GM only) */}
					{state.markets.length > 0 && (
						<section>
							<h3 className="text-sm font-medium text-slate-400 mb-2">True values (GM only)</h3>
							<p className="text-xs text-slate-500 mb-2">
								Set the true value of each market before or during the game. Derivatives are computed from underlyings.
							</p>
							<div className="space-y-2">
								{state.markets.map((m) => (
									<div key={m.id} className="flex flex-wrap items-center gap-2">
										<span className="text-sm w-32 truncate" title={m.name}>{m.name}</span>
										<input
											type="number"
											step="0.01"
											value={trueValueInputs[m.id] ?? state.marketTrueValues?.[m.id] ?? ""}
											onChange={(e) =>
												setTrueValueInputs((prev) => ({ ...prev, [m.id]: e.target.value }))
											}
											placeholder="Value"
											className="w-24 rounded bg-slate-800 border border-slate-600 px-2 py-1.5 text-sm font-mono"
										/>
										<button
											type="button"
											onClick={() => {
												const v = Number(trueValueInputs[m.id] ?? state.marketTrueValues?.[m.id]);
												if (Number.isFinite(v)) {
													gmSetTrueValue(m.id, v);
													setTrueValueInputs((prev) => ({ ...prev, [m.id]: "" }));
												}
											}}
											className="rounded bg-slate-700 hover:bg-slate-600 px-2 py-1.5 text-xs font-medium"
										>
											Set
										</button>
										{state.marketTrueValues?.[m.id] != null && (
											<span className="text-slate-500 text-xs">
												= {state.marketTrueValues[m.id]}
											</span>
										)}
									</div>
								))}
							</div>
						</section>
					)}

					{/* Player positions & exposures */}
					{playersList.length > 0 && (
						<section>
							<h3 className="text-sm font-medium text-slate-400 mb-2">Player positions & exposure</h3>
							<div className="rounded-lg border border-slate-700 overflow-hidden max-h-48 overflow-y-auto">
								<table className="w-full text-sm">
									<thead className="bg-slate-800/50 sticky top-0">
										<tr>
											<th className="text-left px-3 py-2 text-slate-400 font-medium">Player</th>
											<th className="text-right px-3 py-2 text-slate-400 font-medium">Cash</th>
											<th className="text-right px-3 py-2 text-slate-400 font-medium">P&L</th>
										</tr>
									</thead>
									<tbody>
										{playersList.map((p) => (
											<tr key={p.id} className="border-t border-slate-700">
												<td className="px-3 py-2">{p.displayName}</td>
												<td className="px-3 py-2 text-right font-mono">{p.cash.toFixed(2)}</td>
												<td
													className={`px-3 py-2 text-right font-mono ${
														p.totalPnl >= 0 ? "text-emerald-400" : "text-red-400"
													}`}
												>
													{p.totalPnl >= 0 ? "+" : ""}
													{p.totalPnl.toFixed(2)}
												</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						</section>
					)}

					{/* Visibility */}
					<section>
						<h3 className="text-sm font-medium text-slate-400 mb-2">Position visibility</h3>
						<label className="flex items-center gap-2 text-sm">
							<input
								type="checkbox"
								checked={state.showIndividualPositions}
								onChange={(e) => gmSetVisibility(e.target.checked)}
								className="rounded border-slate-600"
							/>
							Show individual positions to all
						</label>
					</section>
				</div>
			</div>
		</div>
	);
}
