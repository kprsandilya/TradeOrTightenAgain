/**
 * In-memory order book with price-time priority matching.
 * Deterministic: same inputs produce same fills.
 */

import { v4 as uuidv4 } from 'uuid';
import type { MarketId, OrderId, PlayerId } from './types';
import type { Order, Trade } from './types';

export interface OrderBookOptions {
  marketId: MarketId;
}

interface InternalOrder extends Order {
  _index: number; // for stable sort by time
}

export class OrderBook {
  private readonly marketId: MarketId;
  private bids: InternalOrder[] = []; // descending by price, then ascending by time
  private asks: InternalOrder[] = []; // ascending by price, then ascending by time
  private orderById = new Map<OrderId, InternalOrder>();
  private indexCounter = 0;
  private lastTradePrice: number | undefined;

  constructor(options: OrderBookOptions) {
    this.marketId = options.marketId;
  }

  addOrder(
    playerId: PlayerId,
    side: 'bid' | 'ask',
    price: number,
    quantity: number,
    validator?: (buyerId: PlayerId, sellerId: PlayerId, marketId: MarketId, quantity: number) => boolean,
  ): { order: Order; trades: Trade[] } {
    if (quantity <= 0 || price <= 0) {
      throw new Error('Invalid order: price and quantity must be positive');
    }
    const id = uuidv4() as OrderId;
    const now = Date.now();
    const idx = this.indexCounter++;
    const order: InternalOrder = {
      id,
      marketId: this.marketId,
      playerId,
      side,
      price,
      quantity,
      remainingQuantity: quantity,
      createdAt: now,
      _index: idx,
    };
    this.orderById.set(id, order);
    const list = side === 'bid' ? this.bids : this.asks;
    list.push(order);
    this.sortBook(side);
    const trades = this.match(validator);
    return { order: this.toPublicOrder(order), trades };
  }

  cancelOrder(orderId: OrderId): boolean {
    const order = this.orderById.get(orderId);
    if (!order || order.remainingQuantity <= 0) return false;
    const list = order.side === 'bid' ? this.bids : this.asks;
    const i = list.indexOf(order);
    if (i >= 0) list.splice(i, 1);
    this.orderById.delete(orderId);
    order.remainingQuantity = 0;
    return true;
  }

  private sortBook(side: 'bid' | 'ask'): void {
    const list = side === 'bid' ? this.bids : this.asks;
    if (side === 'bid') {
      list.sort((a, b) => {
        if (b.price !== a.price) return b.price - a.price;
        return a._index - b._index;
      });
    } else {
      list.sort((a, b) => {
        if (a.price !== b.price) return a.price - b.price;
        return a._index - b._index;
      });
    }
  }

  private match(
    validator?: (buyerId: PlayerId, sellerId: PlayerId, marketId: MarketId, quantity: number) => boolean,
  ): Trade[] {
    const trades: Trade[] = [];
    while (this.bids.length > 0 && this.asks.length > 0) {
      const bestBid = this.bids[0];
      const bestAsk = this.asks[0];
      if (bestBid.price < bestAsk.price) break;
      const qty = Math.min(bestBid.remainingQuantity, bestAsk.remainingQuantity);
      if (validator && !validator(bestBid.playerId, bestAsk.playerId, this.marketId, qty)) {
        break; // partial fill: stop matching, return trades so far
      }
      const price = bestBid._index < bestAsk._index ? bestBid.price : bestAsk.price;
      this.lastTradePrice = price;
      const trade: Trade = {
        id: uuidv4(),
        marketId: this.marketId,
        bidOrderId: bestBid.id,
        askOrderId: bestAsk.id,
        buyerId: bestBid.playerId,
        sellerId: bestAsk.playerId,
        price,
        quantity: qty,
        timestamp: Date.now(),
      };
      trades.push(trade);
      bestBid.remainingQuantity -= qty;
      bestAsk.remainingQuantity -= qty;
      if (bestBid.remainingQuantity <= 0) {
        this.bids.shift();
        this.orderById.delete(bestBid.id);
      }
      if (bestAsk.remainingQuantity <= 0) {
        this.asks.shift();
        this.orderById.delete(bestAsk.id);
      }
    }
    return trades;
  }

  getSnapshot(): { bids: Array<{ price: number; quantity: number; playerIds: string[] }>; asks: Array<{ price: number; quantity: number; playerIds: string[] }>; lastTradePrice?: number } {
    const aggregate = (list: InternalOrder[]) => {
      const byPrice = new Map<number, { quantity: number; playerIds: Set<string> }>();
      for (const o of list) {
        if (o.remainingQuantity <= 0) continue;
        const existing = byPrice.get(o.price);
        if (existing) {
          existing.quantity += o.remainingQuantity;
          existing.playerIds.add(o.playerId);
        } else {
          byPrice.set(o.price, { quantity: o.remainingQuantity, playerIds: new Set([o.playerId]) });
        }
      }
      return Array.from(byPrice.entries())
        .map(([price, { quantity, playerIds }]) => ({
          price,
          quantity,
          playerIds: Array.from(playerIds),
        }))
        .sort((a, b) => (list === this.bids ? b.price - a.price : a.price - b.price));
    };
    return {
      bids: aggregate(this.bids),
      asks: aggregate(this.asks),
      lastTradePrice: this.lastTradePrice,
    };
  }

  getSpread(): number | undefined {
    if (this.bids.length === 0 || this.asks.length === 0) return undefined;
    return this.asks[0].price - this.bids[0].price;
  }

  private toPublicOrder(o: InternalOrder): Order {
    const { _index, ...rest } = o;
    return rest;
  }
}
