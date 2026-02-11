import { useState } from "react";
import { useGame } from "../context/GameContext";
import { useAuth } from "../context/AuthContext";

export function JoinScreen() {
	const { connected, createGame, joinGame, error } = useGame();
	const auth = useAuth();
	const [mode, setMode] = useState<"join" | "create">("join");
	const [code, setCode] = useState("");
	const [name, setName] = useState(auth?.user?.displayName ?? "");
	const [secret, setSecret] = useState("");
	const [createSecret, setCreateSecret] = useState("");
	const [spreadSec, setSpreadSec] = useState(60);
	const [tradingSec, setTradingSec] = useState(120);
	const [loading, setLoading] = useState(false);
	const [createdCode, setCreatedCode] = useState<string | null>(null);

	const handleJoin = async (e: React.FormEvent) => {
		e.preventDefault();
		setLoading(true);
		const res = await joinGame(code.trim().toUpperCase(), name.trim() || "Player", secret || undefined);
		setLoading(false);
		if (res) setCreatedCode(null);
	};

	const handleCreate = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!createSecret.trim()) return;
		setLoading(true);
		const res = await createGame(createSecret.trim(), {
			spreadTimerSeconds: spreadSec,
			openTradingTimerSeconds: tradingSec,
		});
		setLoading(false);
		if (res) setCreatedCode(res);
	};

	return (
		<div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6">
			<div className="w-full max-w-md space-y-8">
				<div className="text-center">
					<div className="flex justify-end mb-2">
						{auth && (
							<button
								type="button"
								onClick={auth.signOut}
								className="text-sm text-slate-500 hover:text-red-400"
							>
								Sign out
							</button>
						)}
					</div>
					<h1 className="text-3xl font-bold tracking-tight text-emerald-400">Trade or Tighten</h1>
					<p className="mt-2 text-slate-400">Real-time multiplayer market-making game</p>
				</div>

				{!connected && (
					<div className="rounded-lg bg-amber-950/50 border border-amber-700/50 text-amber-200 px-4 py-3">
						Connecting to server…
					</div>
				)}

				{error && (
					<div className="rounded-lg bg-red-950/50 border border-red-700/50 text-red-200 px-4 py-3">
						{error}
					</div>
				)}

				{createdCode && (
					<div className="rounded-lg bg-emerald-950/50 border border-emerald-700/50 px-4 py-3">
						<p className="text-emerald-200 font-medium">Game created</p>
						<p className="mt-1 text-2xl font-mono tracking-widest text-emerald-400">{createdCode}</p>
						<p className="mt-1 text-sm text-slate-400">Share this code with players. You are the gamemaster.</p>
					</div>
				)}

				<div className="flex rounded-lg bg-slate-800/50 border border-slate-700 p-1">
					<button
						type="button"
						onClick={() => setMode("join")}
						className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${
							mode === "join" ? "bg-slate-700 text-white" : "text-slate-400 hover:text-slate-200"
						}`}
					>
						Join game
					</button>
					<button
						type="button"
						onClick={() => setMode("create")}
						className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${
							mode === "create" ? "bg-slate-700 text-white" : "text-slate-400 hover:text-slate-200"
						}`}
					>
						Create game
					</button>
				</div>

				{mode === "join" ? (
					<form onSubmit={handleJoin} className="space-y-4">
						<div>
							<label className="block text-sm font-medium text-slate-400 mb-1">Game code</label>
							<input
								type="text"
								value={code}
								onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 6))}
								placeholder="ABC123"
								className="w-full rounded-lg bg-slate-800 border border-slate-600 px-4 py-2.5 font-mono text-lg tracking-widest uppercase"
								maxLength={6}
								required
							/>
						</div>
						<div>
							<label className="block text-sm font-medium text-slate-400 mb-1">Display name</label>
							<input
								type="text"
								value={name}
								onChange={(e) => setName(e.target.value)}
								placeholder="Your name"
								className="w-full rounded-lg bg-slate-800 border border-slate-600 px-4 py-2.5"
								required
							/>
						</div>
						<div>
							<label className="block text-sm font-medium text-slate-400 mb-1">
								Gamemaster secret (optional)
							</label>
							<input
								type="password"
								value={secret}
								onChange={(e) => setSecret(e.target.value)}
								placeholder="Only if you are GM"
								className="w-full rounded-lg bg-slate-800 border border-slate-600 px-4 py-2.5"
							/>
						</div>
						<button
							type="submit"
							disabled={!connected || loading}
							className="w-full rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 py-2.5 font-medium"
						>
							{loading ? "Joining…" : "Join"}
						</button>
					</form>
				) : (
					<form onSubmit={handleCreate} className="space-y-4">
						<div>
							<label className="block text-sm font-medium text-slate-400 mb-1">Gamemaster secret</label>
							<input
								type="password"
								value={createSecret}
								onChange={(e) => setCreateSecret(e.target.value)}
								placeholder="Choose a secret"
								className="w-full rounded-lg bg-slate-800 border border-slate-600 px-4 py-2.5"
								required
							/>
						</div>
						<div className="grid grid-cols-2 gap-4">
							<div>
								<label className="block text-sm font-medium text-slate-400 mb-1">Spread timer (s)</label>
								<input
									type="number"
									min={10}
									max={300}
									value={spreadSec}
									onChange={(e) => setSpreadSec(Number(e.target.value))}
									className="w-full rounded-lg bg-slate-800 border border-slate-600 px-4 py-2.5"
								/>
							</div>
							<div>
								<label className="block text-sm font-medium text-slate-400 mb-1">Open trading (s)</label>
								<input
									type="number"
									min={30}
									max={600}
									value={tradingSec}
									onChange={(e) => setTradingSec(Number(e.target.value))}
									className="w-full rounded-lg bg-slate-800 border border-slate-600 px-4 py-2.5"
								/>
							</div>
						</div>
						<button
							type="submit"
							disabled={!connected || loading}
							className="w-full rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 py-2.5 font-medium"
						>
							{loading ? "Creating…" : "Create game"}
						</button>
					</form>
				)}
			</div>
		</div>
	);
}
