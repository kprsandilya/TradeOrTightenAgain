/**
 * Manages multiple concurrent games: create, join by code, lookup.
 */

import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import type { GameCode, Market, MarketId, PlayerId } from './types';
import type { GameConfig } from './game-instance';
import type { GmAddMarketPayload, GmAddDerivativePayload } from './types';
import { GameInstance } from './game-instance';

const GAME_CODE_LENGTH = 6;
const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateGameCode(): GameCode {
  let code = '';
  for (let i = 0; i < GAME_CODE_LENGTH; i++) {
    code += CHARS[Math.floor(Math.random() * CHARS.length)];
  }
  return code;
}

@Injectable()
export class GameManagerService {
  private games = new Map<GameCode, GameInstance>();
  private playerToGame = new Map<PlayerId, GameCode>();

  createGame(
    gamemasterSecret: string,
    options?: {
      spreadTimerSeconds?: number;
      openTradingTimerSeconds?: number;
      noTighterWindowSeconds?: number;
    },
  ): GameCode {
    let code: GameCode;
    do {
      code = generateGameCode();
    } while (this.games.has(code));
    const config: GameConfig = {
      gameCode: code,
      gamemasterSecret,
      spreadTimerMs: options?.spreadTimerSeconds ? options.spreadTimerSeconds * 1000 : undefined,
      openTradingTimerMs: options?.openTradingTimerSeconds ? options.openTradingTimerSeconds * 1000 : undefined,
      noTighterWindowMs: options?.noTighterWindowSeconds ? options.noTighterWindowSeconds * 1000 : undefined,
    };
    this.games.set(code, new GameInstance(config));
    return code;
  }

  getGame(gameCode: GameCode): GameInstance | undefined {
    return this.games.get(gameCode.toUpperCase());
  }

  joinGame(
    gameCode: GameCode,
    playerId: PlayerId,
    displayName: string,
    isGamemaster: boolean,
  ): GameInstance | undefined {
    const code = gameCode.toUpperCase();
    const game = this.games.get(code);
    if (!game) return undefined;
    game.addPlayer(playerId, displayName, isGamemaster);
    this.playerToGame.set(playerId, code);
    return game;
  }

  leaveGame(playerId: PlayerId): GameCode | undefined {
    const code = this.playerToGame.get(playerId);
    if (!code) return undefined;
    const game = this.games.get(code);
    if (game) {
      game.removePlayer(playerId);
      const snap = game.getSnapshot();
      if (Object.keys(snap.players).length === 0) this.games.delete(code);
    }
    this.playerToGame.delete(playerId);
    return code;
  }

  getGameForPlayer(playerId: PlayerId): GameInstance | undefined {
    const code = this.playerToGame.get(playerId);
    return code ? this.games.get(code) : undefined;
  }

  addMarket(gameCode: GameCode, payload: GmAddMarketPayload): boolean {
    const game = this.games.get(gameCode.toUpperCase());
    if (!game) return false;
    const market: Market = {
      id: uuidv4() as MarketId,
      name: payload.name,
      description: payload.description,
    };
    game.addMarket(market);
    return true;
  }

  addDerivative(gameCode: GameCode, payload: GmAddDerivativePayload): boolean {
    const game = this.games.get(gameCode.toUpperCase());
    if (!game) return false;
    const market: Market = {
      id: uuidv4() as MarketId,
      name: payload.name,
      description: payload.description,
      underlyingWeights: payload.underlyingWeights,
      condition: payload.condition,
    };
    game.addMarket(market);
    return true;
  }

  setCallbacks(
    gameCode: GameCode,
    callbacks: Parameters<GameInstance['setCallbacks']>[0],
  ): void {
    const game = this.games.get(gameCode.toUpperCase());
    if (game) game.setCallbacks(callbacks);
  }
}
