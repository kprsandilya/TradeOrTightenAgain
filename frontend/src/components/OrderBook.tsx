import type { OrderBookSnapshot } from "../types/game";

interface Props {
	orderBook: OrderBookSnapshot;
}

export function OrderBook({ orderBook }: Props) {
	const { bids, asks, lastTradePrice, spread } = orderBook;
	return (
		<div className="rounded-lg border border-slate-700 bg-slate-900/80 overflow-hidden">
			<div className="px-3 py-2 border-b border-slate-700 flex justify-between text-sm text-slate-400">
				<span>Order book</span>
				{lastTradePrice != null && (
					<span className="text-emerald-400 font-mono">Last: {lastTradePrice.toFixed(2)}</span>
				)}
				{spread != null && <span className="text-amber-400 font-mono">Spread: {spread.toFixed(2)}</span>}
			</div>
			<div className="grid grid-cols-2 text-sm">
				<div>
					<div className="px-3 py-1 bg-red-950/30 text-red-400 font-medium">Bid</div>
					{bids.length === 0 ? (
						<div className="px-3 py-4 text-slate-500">—</div>
					) : (
						bids.slice(0, 8).map((level, i) => (
							<div
								key={`b-${level.price}-${i}`}
								className="px-3 py-0.5 flex justify-between font-mono text-red-300/90"
							>
								<span>{level.price.toFixed(2)}</span>
								<span>{level.quantity}</span>
							</div>
						))
					)}
				</div>
				<div>
					<div className="px-3 py-1 bg-emerald-950/30 text-emerald-400 font-medium">Ask</div>
					{asks.length === 0 ? (
						<div className="px-3 py-4 text-slate-500">—</div>
					) : (
						asks.slice(0, 8).map((level, i) => (
							<div
								key={`a-${level.price}-${i}`}
								className="px-3 py-0.5 flex justify-between font-mono text-emerald-300/90"
							>
								<span>{level.price.toFixed(2)}</span>
								<span>{level.quantity}</span>
							</div>
						))
					)}
				</div>
			</div>
		</div>
	);
}
