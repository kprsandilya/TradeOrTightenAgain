import { useGame } from "../context/GameContext";

export function GameEndedScreen() {
	const { gameEnded, state, leaveGame, playerId } = useGame();
	const final = gameEnded ?? (state?.status === "stopped" ? { state, message: "Game ended." } : null);
	if (!final) return null;

	const { state: s, message } = final;
	const players = s ? Object.values(s.players).sort((a, b) => b.totalPnl - a.totalPnl) : [];
	const me = playerId && s ? s.players[playerId] : null;

	return (
		<div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6">
			<div className="w-full max-w-lg space-y-6">
				<div className="text-center">
					<h1 className="text-2xl font-bold text-amber-400">Game ended</h1>
					<p className="mt-2 text-slate-400">{message}</p>
				</div>

				<div className="rounded-lg border border-slate-700 bg-slate-900/80 overflow-hidden">
					<div className="px-4 py-3 border-b border-slate-700 text-sm font-medium text-slate-400">
						Final positions & P&L
					</div>
					<ul className="divide-y divide-slate-700">
						{players.map((p) => (
							<li
								key={p.id}
								className={`px-4 py-3 flex justify-between items-center ${
									p.id === playerId ? "bg-slate-800/50" : ""
								}`}
							>
								<span className="font-medium">
									{p.displayName}
									{p.id === playerId && " (you)"}
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

				{me && (
					<div className="rounded-lg border border-slate-700 bg-slate-900/80 px-4 py-3 text-sm">
						<div className="text-slate-400 mb-1">Your final position</div>
						<div className="flex justify-between">
							<span>Cash</span>
							<span className="font-mono text-emerald-400">{me.cash.toFixed(2)}</span>
						</div>
						{Object.values(me.positions).filter((p) => p.quantity !== 0).length > 0 && (
							<div className="mt-2 space-y-1">
								{Object.values(me.positions)
									.filter((p) => p.quantity !== 0)
									.map((p) => (
										<div key={p.marketId} className="flex justify-between font-mono text-sm">
											<span>Position</span>
											<span className={p.quantity > 0 ? "text-emerald-400" : "text-red-400"}>
												{p.quantity}
											</span>
										</div>
									))}
							</div>
						)}
						<div className="mt-2 pt-2 border-t border-slate-700 flex justify-between font-medium">
							<span>Total P&L</span>
							<span className={me.totalPnl >= 0 ? "text-emerald-400" : "text-red-400"}>
								{me.totalPnl >= 0 ? "+" : ""}
								{me.totalPnl.toFixed(2)}
							</span>
						</div>
					</div>
				)}

				<button
					type="button"
					onClick={leaveGame}
					className="w-full rounded-lg bg-slate-700 hover:bg-slate-600 py-2.5 font-medium"
				>
					Leave game
				</button>
			</div>
		</div>
	);
}
