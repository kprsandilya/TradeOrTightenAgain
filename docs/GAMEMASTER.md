# Gamemaster Controls

This document describes how to run a game as the **gamemaster** and the WebSocket event schema used between frontend and backend.

## Becoming the gamemaster

- **Create a game**: On the join screen, choose "Create game", enter a **gamemaster secret**, and optionally set spread timer and open-trading timer. You receive a 6-character **game code** to share. You are automatically the gamemaster for that game.
- **Join as GM**: To become gamemaster of an existing game, join with the same game code and enter the **gamemaster secret** when prompted. Your client will then show the Gamemaster panel.

## Market visibility

- **Spread-quoting stage**: The current best bid–ask spread is visible to all players at all times (shown in the Market section and in spread updates).
- **Open trading**: All players see the active order book, the most recent trade prices, and their own position and net exposure. The order book and last trade are shown in the sidebar and in the Market summary.

## Gamemaster role

The gamemaster **does not participate as a trader**. The gamemaster cannot submit spreads, quotes, or orders. The gamemaster’s responsibilities are:

- Setting the **true value** of each underlying market (before or during the game)
- Observing all player actions and market activity in real time
- Sending informational **broadcasts** to all players
- **Controlling** all game stages and timers (start, pause, resume, advance/revert, set timer)
- **Ending the game** at any time

When the gamemaster **ends the game**:

- All active trading stops immediately
- All participants receive a **game ended** event with final state
- Final positions and P&L are recorded and shown on the game-ended screen
- Players can leave the game from that screen

## Gamemaster capabilities

| Action | Description |
|--------|-------------|
| **Start game** | Start the first round. Requires at least one market to have been added. |
| **Pause / Resume** | Pause or resume the current round (timers stop on pause). |
| **End game** | End the game: trading stops, all receive final state and game-ended screen. |
| **Next stage** | Manually advance to the next stage (e.g. end spread quoting, end forced trading, end open trading, or start next round). |
| **Previous stage** | Rewind one stage (limited support; mainly from market maker quote back to spread quoting). |
| **Add market** | Add an underlying market (name + description). Required before starting. |
| **Add derivative** | Add a derivative market defined by weights over existing market IDs. Derivative true value is computed server-side from underlying true values. |
| **Set true value** | Set the true value of a market (GM only; visible only to GM). Derivatives are computed from underlyings. |
| **Broadcast** | Send a text announcement to all players (news, hints, clarifications). |
| **Set timer** | Set the current stage timer (spread quoting or open trading). Timer expiration automatically advances the stage. |
| **Position visibility** | Toggle whether all players see each other’s positions or only aggregate/own data. |
| **Exposure limit** | Set a maximum absolute position size per market (applied to all players). Orders/trades that would exceed it are rejected. 0 = no limit. |
| **Finalize P&L** | After all markets are complete, compute and lock P&L using the true values set by the gamemaster. **Required before ending the game.** |
| **End game** | Allowed only after P&L has been finalized. Terminates connections and marks the game complete. |

All gamemaster actions are validated on the backend and broadcast to connected players immediately. **Position limits**: players are not constrained by cash; only the global exposure limit (set by the gamemaster) applies.

## Sequential market progression

Markets progress **strictly sequentially**. Once a market completes (open trading ends):

- That market is **immediately closed**; trading is permanently disabled for it.
- The game **automatically transitions** to the next market (spread quoting for the next market).
- Previous markets cannot be revisited, reopened, or traded again.

This continues until all predefined markets (including derivatives) have concluded. When the last market completes, **all markets complete** and the game enters the finalization phase.

## Round flow (per market)

1. **Spread quoting** – Current best spread is visible to all and updated in real time. Each player sees whether their spread is leading. Submissions must be tighter than or equal to the current best. Ends when the timer expires or no tighter spread within the no-tighter window.
2. **Market maker quote** – The player with the tightest spread quotes bid and ask (respecting that spread).
3. **Forced trading** – All non–market makers must trade (buy or sell) against the quoted market.
4. **Open trading** – Continuous double auction; any crossing bid/ask matches and clears. Ends when the round timer expires.
5. **Round end** – Market closes; game auto-advances to the next market (or to “all markets complete” if none left).

## WebSocket event schema

### Client → Server (events sent by frontend)

| Event | Payload | Description |
|-------|---------|-------------|
| `game:join` | `{ gameCode, displayName, isGamemaster?, gamemasterSecret? }` | Join a game by code; optional GM secret to join as gamemaster. |
| `game:leave` | — | Leave current game. |
| `game:spread:submit` | `{ spreadWidth }` | Submit spread width (Stage 1). |
| `game:mm:quote` | `{ bid, ask }` | Market maker quotes bid/ask (Stage 2). |
| `game:forced:trade` | `{ direction: "buy" \| "sell", quantity }` | Execute forced trade (Stage 3). |
| `game:order:submit` | `{ side: "bid" \| "ask", price, quantity }` | Submit limit order (Stage 4). |
| `gm:create` | `{ gamemasterSecret, spreadTimerSeconds?, openTradingTimerSeconds?, noTighterWindowSeconds? }` | Create a new game (GM only). |
| `gm:start` | — | Start the game (GM). |
| `gm:pause` | — | Pause (GM). |
| `gm:resume` | — | Resume (GM). |
| `gm:stop` | — | Stop game (GM). |
| `gm:next_stage` | — | Advance to next stage (GM). |
| `gm:prev_stage` | — | Go back one stage (GM). |
| `gm:add_market` | `{ name, description }` | Add underlying market (GM). |
| `gm:add_derivative` | `{ name, description, underlyingWeights, condition? }` | Add derivative market (GM). |
| `gm:broadcast` | `{ text }` | Broadcast announcement (GM). |
| `gm:set_timer` | `{ seconds }` | Set current stage timer (GM). |
| `gm:set_visibility` | `{ showIndividualPositions }` | Toggle position visibility (GM). |
| `gm:set_true_value` | `{ marketId, value }` | Set true value of a market (GM only). |
| `gm:set_exposure_limit` | `{ maxExposure }` | Set max absolute position size per market (0 = no limit). |
| `gm:finalize_pnl` | — | Finalize P&L using true values (only when all markets complete). |

### Server → Client (events emitted by backend)

| Event | Payload | Description |
|-------|---------|-------------|
| `game:joined` | `{ gameCode, playerId, isGamemaster, state }` | Joined (or created) game; full `GameState` included. |
| `game:state` | `{ state }` | Full game state update. |
| `game:stage_changed` | `{ stage, round }` | Round stage changed. |
| `game:spread_update` | `{ bestSpread, bestSpreadPlayerId, submissions }` | New best spread or submission list. |
| `game:order_book` | `{ orderBook }` | Order book snapshot. |
| `game:trade` | `{ trade }` | A trade occurred. |
| `game:announcement` | `{ id, text, at }` | New announcement. |
| `game:timer` | `{ stage, endsAt, secondsRemaining }` | Timer update. |
| `game:player_left` | `{ playerId, displayName? }` | A player left. |
| `game:error` | `{ message }` | Error (e.g. invalid action). |
| `game:ended` | `{ state, message }` | Game ended by GM; final state and message. All trading stopped. |

The backend is the single source of truth for game state, orders, trades, positions, and timers. True values are sent only in state snapshots for gamemaster clients.
