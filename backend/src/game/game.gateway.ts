/**
 * WebSocket gateway: join game, player actions, gamemaster controls.
 * Each game is a Socket.IO room; backend is the single source of truth.
 */

import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import type { PlayerId } from './types';
import {
  ClientEvents,
  ServerEvents,
  type JoinGamePayload,
  type SubmitSpreadPayload,
  type MarketMakerQuotePayload,
  type ForcedTradePayload,
  type SubmitOrderPayload,
  type CancelOrderPayload,
  type GmCreateGamePayload,
  type GmAddMarketPayload,
  type GmAddDerivativePayload,
  type GmBroadcastPayload,
  type GmSetTimerPayload,
  type GmSetVisibilityPayload,
} from './types';
import type { JoinedPayload, StatePayload, StageChangedPayload, SpreadUpdatePayload, TimerPayload, TradePayload, AnnouncementPayload, GameEndedPayload } from './types';
import type { GmSetTrueValuePayload, GmSetExposureLimitPayload } from './types';
import { GameManagerService } from './game-manager.service';

interface SocketData {
  playerId?: PlayerId;
  gameCode?: string;
  displayName?: string;
  isGamemaster?: boolean;
}

@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGIN?.split(',').map((o) => o.trim()) || '*',
    credentials: true,
  },
  namespace: '/',
})
export class GameGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  constructor(private readonly gameManager: GameManagerService) {}

  handleConnection(): void {
    // No auth until join
  }

  handleDisconnect(client: { id: string; data?: SocketData }): void {
    const data = (client as any).data as SocketData | undefined;
    const playerId = data?.playerId;
    const gameCode = data?.gameCode;
    if (playerId && gameCode) {
      this.gameManager.leaveGame(playerId);
      this.server.to(gameCode).emit(ServerEvents.PLAYER_LEFT, { playerId, displayName: data.displayName });
    }
  }

  private room(gameCode: string): string {
    return `game:${gameCode.toUpperCase()}`;
  }

  /** Broadcast state to room; GM gets true values; non-GM viewers get cash hidden (exposure only). */
  private async broadcastState(gameCode: string): Promise<void> {
    const game = this.gameManager.getGame(gameCode);
    if (!game) return;
    const roomName = this.room(gameCode);
    const sockets = await this.server.in(roomName).fetchSockets();
    for (const socket of sockets) {
      const data = (socket as any).data as SocketData | undefined;
      const forGm = data?.isGamemaster ?? false;
      const viewerId = data?.playerId;
      socket.emit(ServerEvents.STATE, { state: game.getSnapshot(forGm, viewerId) } as StatePayload);
    }
  }

  private bindGameCallbacks(gameCode: string): void {
    this.gameManager.setCallbacks(gameCode, {
      onStageChange: (stage, round) => {
        this.server.to(this.room(gameCode)).emit(ServerEvents.STAGE_CHANGED, {
          stage,
          round,
        } as StageChangedPayload);
        if (round.stageEndsAt != null) {
          const secRem = Math.max(0, Math.ceil((round.stageEndsAt - Date.now()) / 1000));
          this.server.to(this.room(gameCode)).emit(ServerEvents.TIMER, {
            stage: round.stage,
            endsAt: round.stageEndsAt,
            secondsRemaining: secRem,
          } as TimerPayload);
        }
        this.broadcastState(gameCode);
      },
      onOrderBookChange: () => {
        const game = this.gameManager.getGame(gameCode);
        if (game) {
          this.server.to(this.room(gameCode)).emit(ServerEvents.ORDER_BOOK, {
            orderBook: game.getOrderBookSnapshot(),
          });
        }
      },
      onTrade: (trade) => {
        this.server.to(this.room(gameCode)).emit(ServerEvents.TRADE, { trade } as TradePayload);
      },
      onTimer: (endsAt, secondsRemaining) => {
        const game = this.gameManager.getGame(gameCode);
        const r = game?.getRound();
        if (r) {
          this.server.to(this.room(gameCode)).emit(ServerEvents.TIMER, {
            stage: r.stage,
            endsAt,
            secondsRemaining,
          } as TimerPayload);
        }
      },
    });
  }

  @SubscribeMessage(ClientEvents.JOIN_GAME)
  handleJoin(
    client: { id: string; join: (room: string) => void; data?: SocketData },
    payload: JoinGamePayload,
  ): JoinedPayload | { error: string } {
    const { gameCode, displayName, isGamemaster = false, gamemasterSecret } = payload ?? {};
    if (!gameCode || !displayName?.trim()) {
      return { error: 'Game code and display name required' };
    }
    const code = gameCode.toUpperCase();
    const game = this.gameManager.getGame(code);
    if (!game) {
      return { error: 'Game not found' };
    }
    const playerId = uuidv4() as PlayerId;
    const gm = Boolean(isGamemaster && gamemasterSecret && game.checkGamemasterSecret(gamemasterSecret));
    this.gameManager.joinGame(code, playerId, displayName.trim(), gm);
    if (gm) game.setGamemaster(playerId);
    (client as any).data = {
      playerId,
      gameCode: code,
      displayName: displayName.trim(),
      isGamemaster: gm,
    } as SocketData;
    client.join(this.room(code));
    this.bindGameCallbacks(code);
    const state = game.getSnapshot(gm);
    const joined: JoinedPayload = {
      gameCode: code,
      playerId,
      isGamemaster: gm,
      state,
    };
    return joined;
  }

  @SubscribeMessage(ClientEvents.LEAVE_GAME)
  handleLeave(client: { id: string; leave: (room: string) => void; data?: SocketData }): void {
    const data = (client as any).data as SocketData | undefined;
    if (data?.playerId && data?.gameCode) {
      this.gameManager.leaveGame(data.playerId);
      client.leave(this.room(data.gameCode));
      (client as any).data = {};
    }
  }

  private getGameAndPlayer(client: { data?: SocketData }): { game: import('./game-instance').GameInstance; playerId: PlayerId; gameCode: string } | null {
    const data = (client as any).data as SocketData | undefined;
    if (!data?.playerId || !data?.gameCode) return null;
    const game = this.gameManager.getGame(data.gameCode);
    if (!game) return null;
    return { game, playerId: data.playerId, gameCode: data.gameCode };
  }

  @SubscribeMessage(ClientEvents.SUBMIT_SPREAD)
  async handleSpread(client: { data?: SocketData }, payload: SubmitSpreadPayload): Promise<void> {
    const ctx = this.getGameAndPlayer(client);
    if (!ctx) return;
    const { game, playerId, gameCode } = ctx;
    const result = game.submitSpread(playerId, payload.spreadWidth);
    if (!result.ok) {
      this.server.to((client as any).id).emit(ServerEvents.ERROR, { message: result.error });
      return;
    }
    const r = game.getRound();
    if (r) {
      this.server.to(this.room(gameCode)).emit(ServerEvents.SPREAD_UPDATE, {
        bestSpread: r.bestSpread,
        bestSpreadPlayerId: r.bestSpreadPlayerId,
        submissions: r.spreadSubmissions,
      } as SpreadUpdatePayload);
    }
    await this.broadcastState(gameCode);
  }

  @SubscribeMessage(ClientEvents.SUBMIT_MARKET_MAKER_QUOTE)
  handleMMQuote(client: { data?: SocketData }, payload: MarketMakerQuotePayload): void {
    const ctx = this.getGameAndPlayer(client);
    if (!ctx) return;
    const { game, playerId, gameCode } = ctx;
    const result = game.submitMarketMakerQuote(playerId, payload.bid, payload.ask);
    if (!result.ok) {
      this.server.to((client as any).id).emit(ServerEvents.ERROR, { message: result.error });
      return;
    }
    this.broadcastState(gameCode);
  }

  @SubscribeMessage(ClientEvents.SUBMIT_FORCED_TRADE)
  handleForcedTrade(client: { data?: SocketData }, payload: ForcedTradePayload): void {
    const ctx = this.getGameAndPlayer(client);
    if (!ctx) return;
    const { game, playerId, gameCode } = ctx;
    const result = game.executeForcedTrade(playerId, payload.direction, payload.quantity);
    if (!result.ok) {
      this.server.to((client as any).id).emit(ServerEvents.ERROR, { message: result.error });
      return;
    }
    this.broadcastState(gameCode);
  }

  @SubscribeMessage(ClientEvents.SUBMIT_ORDER)
  handleOrder(client: { data?: SocketData }, payload: SubmitOrderPayload): void {
    const ctx = this.getGameAndPlayer(client);
    if (!ctx) return;
    const { game, playerId, gameCode } = ctx;
    const result = game.submitOrder(playerId, payload.side, payload.price, payload.quantity);
    if (!result.ok) {
      this.server.to((client as any).id).emit(ServerEvents.ERROR, { message: result.error });
      return;
    }
    this.server.to(this.room(gameCode)).emit(ServerEvents.ORDER_BOOK, { orderBook: game.getOrderBookSnapshot() });
    if (result.trades?.length) {
      for (const trade of result.trades) {
        this.server.to(this.room(gameCode)).emit(ServerEvents.TRADE, { trade });
      }
    }
    this.broadcastState(gameCode);
  }

  @SubscribeMessage(ClientEvents.CANCEL_ORDER)
  handleCancelOrder(client: { data?: SocketData }, _payload: CancelOrderPayload): void {
    // Optional: implement cancel in OrderBook and GameInstance if needed
    this.server.to((client as any).id).emit(ServerEvents.ERROR, { message: 'Cancel not implemented in this version' });
  }

  private isGamemaster(client: { data?: SocketData }, gameCode: string): boolean {
    const data = (client as any).data as SocketData | undefined;
    if (!data?.playerId) return false;
    const game = this.gameManager.getGame(gameCode);
    return game?.isGamemaster(data.playerId) ?? false;
  }

  @SubscribeMessage(ClientEvents.GM_CREATE_GAME)
  handleGmCreate(client: { id: string; join: (room: string) => void; data?: SocketData }, payload: GmCreateGamePayload): { gameCode?: string; error?: string } {
    const { gamemasterSecret, spreadTimerSeconds, openTradingTimerSeconds, noTighterWindowSeconds } = payload ?? {};
    if (!gamemasterSecret) return { error: 'Gamemaster secret required' };
    const gameCode = this.gameManager.createGame(gamemasterSecret, {
      spreadTimerSeconds,
      openTradingTimerSeconds,
      noTighterWindowSeconds,
    });
    const playerId = uuidv4() as PlayerId;
    const game = this.gameManager.getGame(gameCode)!;
    this.gameManager.joinGame(gameCode, playerId, 'Gamemaster', true);
    (client as any).data = {
      playerId,
      gameCode,
      displayName: 'Gamemaster',
      isGamemaster: true,
    } as SocketData;
    client.join(this.room(gameCode));
    this.bindGameCallbacks(gameCode);
    const state = game.getSnapshot(true);
    this.server.to((client as any).id).emit(ServerEvents.JOINED, {
      gameCode,
      playerId,
      isGamemaster: true,
      state,
    } as JoinedPayload);
    return { gameCode };
  }

  @SubscribeMessage(ClientEvents.GM_START_GAME)
  async handleGmStart(client: { data?: SocketData }): Promise<void> {
    const ctx = this.getGameAndPlayer(client);
    if (!ctx || !this.isGamemaster(client, ctx.gameCode)) return;
    ctx.game.startGame();
    await this.broadcastState(ctx.gameCode);
  }

  @SubscribeMessage(ClientEvents.GM_PAUSE_GAME)
  async handleGmPause(client: { data?: SocketData }): Promise<void> {
    const ctx = this.getGameAndPlayer(client);
    if (!ctx || !this.isGamemaster(client, ctx.gameCode)) return;
    ctx.game.pause();
    await this.broadcastState(ctx.gameCode);
  }

  @SubscribeMessage(ClientEvents.GM_RESUME_GAME)
  async handleGmResume(client: { data?: SocketData }): Promise<void> {
    const ctx = this.getGameAndPlayer(client);
    if (!ctx || !this.isGamemaster(client, ctx.gameCode)) return;
    ctx.game.resume();
    await this.broadcastState(ctx.gameCode);
  }

  @SubscribeMessage(ClientEvents.GM_STOP_GAME)
  async handleGmStop(client: { data?: SocketData }): Promise<void> {
    const ctx = this.getGameAndPlayer(client);
    if (!ctx || !this.isGamemaster(client, ctx.gameCode)) return;
    if (!ctx.game.stop()) {
      this.server.to((client as any).id).emit(ServerEvents.ERROR, {
        message: 'Cannot end game until P&L has been finalized. Finalize P&L first when all markets are complete.',
      });
      return;
    }
    const finalState = ctx.game.getSnapshot(true);
    const payload: GameEndedPayload = {
      state: finalState,
      message: 'Game ended by gamemaster. All trading stopped. Final positions and P&L recorded.',
    };
    this.server.to(this.room(ctx.gameCode)).emit(ServerEvents.GAME_ENDED, payload);
  }

  @SubscribeMessage(ClientEvents.GM_NEXT_STAGE)
  async handleGmNextStage(client: { data?: SocketData }): Promise<void> {
    const ctx = this.getGameAndPlayer(client);
    if (!ctx || !this.isGamemaster(client, ctx.gameCode)) return;
    ctx.game.nextStage();
    await this.broadcastState(ctx.gameCode);
  }

  @SubscribeMessage(ClientEvents.GM_PREV_STAGE)
  async handleGmPrevStage(client: { data?: SocketData }): Promise<void> {
    const ctx = this.getGameAndPlayer(client);
    if (!ctx || !this.isGamemaster(client, ctx.gameCode)) return;
    ctx.game.prevStage();
    await this.broadcastState(ctx.gameCode);
  }

  @SubscribeMessage(ClientEvents.GM_ADD_MARKET)
  async handleGmAddMarket(client: { data?: SocketData }, payload: GmAddMarketPayload): Promise<void> {
    const ctx = this.getGameAndPlayer(client);
    if (!ctx || !this.isGamemaster(client, ctx.gameCode)) return;
    if (this.gameManager.addMarket(ctx.gameCode, payload)) {
      await this.broadcastState(ctx.gameCode);
    }
  }

  @SubscribeMessage(ClientEvents.GM_ADD_DERIVATIVE)
  async handleGmAddDerivative(client: { data?: SocketData }, payload: GmAddDerivativePayload): Promise<void> {
    const ctx = this.getGameAndPlayer(client);
    if (!ctx || !this.isGamemaster(client, ctx.gameCode)) return;
    if (this.gameManager.addDerivative(ctx.gameCode, payload)) {
      await this.broadcastState(ctx.gameCode);
    }
  }

  @SubscribeMessage(ClientEvents.GM_BROADCAST)
  async handleGmBroadcast(client: { data?: SocketData }, payload: GmBroadcastPayload): Promise<void> {
    const ctx = this.getGameAndPlayer(client);
    if (!ctx || !this.isGamemaster(client, ctx.gameCode)) return;
    ctx.game.addAnnouncement(payload.text);
    const snap = ctx.game.getSnapshot(true);
    const last = snap.announcements[snap.announcements.length - 1];
    if (last) {
      this.server.to(this.room(ctx.gameCode)).emit(ServerEvents.ANNOUNCEMENT, {
        id: last.id,
        text: last.text,
        at: last.at,
      } as AnnouncementPayload);
    }
    await this.broadcastState(ctx.gameCode);
  }

  @SubscribeMessage(ClientEvents.GM_SET_TIMER)
  async handleGmSetTimer(client: { data?: SocketData }, payload: GmSetTimerPayload): Promise<void> {
    const ctx = this.getGameAndPlayer(client);
    if (!ctx || !this.isGamemaster(client, ctx.gameCode)) return;
    const seconds = Math.max(1, Math.min(3600, Number(payload?.seconds) || 60));
    ctx.game.setTimer(seconds);
    const r = ctx.game.getRound();
    if (r?.stageEndsAt != null) {
      this.server.to(this.room(ctx.gameCode)).emit(ServerEvents.TIMER, {
        stage: r.stage,
        endsAt: r.stageEndsAt,
        secondsRemaining: Math.max(0, Math.ceil((r.stageEndsAt - Date.now()) / 1000)),
      } as TimerPayload);
    }
    await this.broadcastState(ctx.gameCode);
  }

  @SubscribeMessage(ClientEvents.GM_SET_VISIBILITY)
  async handleGmSetVisibility(client: { data?: SocketData }, payload: GmSetVisibilityPayload): Promise<void> {
    const ctx = this.getGameAndPlayer(client);
    if (!ctx || !this.isGamemaster(client, ctx.gameCode)) return;
    ctx.game.setVisibility(payload.showIndividualPositions);
    await this.broadcastState(ctx.gameCode);
  }

  @SubscribeMessage(ClientEvents.GM_SET_TRUE_VALUE)
  async handleGmSetTrueValue(client: { data?: SocketData }, payload: GmSetTrueValuePayload): Promise<void> {
    const ctx = this.getGameAndPlayer(client);
    if (!ctx || !this.isGamemaster(client, ctx.gameCode)) return;
    if (ctx.game.setMarketTrueValue(payload.marketId, payload.value)) {
      await this.broadcastState(ctx.gameCode);
    }
  }

  @SubscribeMessage(ClientEvents.GM_SET_EXPOSURE_LIMIT)
  async handleGmSetExposureLimit(client: { data?: SocketData }, payload: GmSetExposureLimitPayload): Promise<void> {
    const ctx = this.getGameAndPlayer(client);
    if (!ctx || !this.isGamemaster(client, ctx.gameCode)) return;
    ctx.game.setMaxExposure(payload.maxExposure);
    await this.broadcastState(ctx.gameCode);
  }

  @SubscribeMessage(ClientEvents.GM_FINALIZE_PNL)
  async handleGmFinalizePnl(client: { data?: SocketData }): Promise<void> {
    const ctx = this.getGameAndPlayer(client);
    if (!ctx || !this.isGamemaster(client, ctx.gameCode)) return;
    const result = ctx.game.finalizePnl();
    if (!result.ok) {
      this.server.to((client as any).id).emit(ServerEvents.ERROR, { message: result.error });
      return;
    }
    await this.broadcastState(ctx.gameCode);
  }
}
