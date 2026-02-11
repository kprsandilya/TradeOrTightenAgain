# Trade or Tighten

Real-time multiplayer financial trading game: market-making, spread quoting, forced trading, and continuous double auction. Multiple concurrent games, WebSocket-backed, with full gamemaster controls.

## Quick start

### Backend (NestJS + Socket.IO)

```bash
cd backend
pnpm install
pnpm run start:dev
```

Runs at **http://localhost:3000**. WebSocket is on the same server (Socket.IO).

### Frontend (React + Vite)

```bash
cd frontend
pnpm install
pnpm run dev
```

Open **http://localhost:5173**. The dev server proxies `/socket.io` to the backend.

### Play

1. **Gamemaster**: Create a game (choose a secret), set timers, add at least one market, then Start game. Share the 6-letter game code.
2. **Players**: Join with the code and a display name. Optionally use the gamemaster secret to join as GM.
3. Follow the round stages: spread quoting → market maker quote → forced trading → open trading → round end. GM can advance stages or set timers.

## Architecture

- **Backend**: NestJS, `GameModule` with `GameGateway` (WebSocket) and `GameManagerService`. One `GameInstance` per game: rounds, stages, order book, positions, P&L. Deterministic matching (price–time).
- **Frontend**: React SPA, Socket.IO client, single-page flow: join/create → game screen with stage-specific actions, order book, positions, leaderboard, and (for GM) gamemaster panel.
- **Events**: See [docs/GAMEMASTER.md](docs/GAMEMASTER.md) for the WebSocket event schema and gamemaster capabilities.

## Gamemaster documentation

Full description of gamemaster controls, round flow, and WebSocket events: **[docs/GAMEMASTER.md](docs/GAMEMASTER.md)**.

## Optional

- **Auth / persistence**: Not implemented; optional AWS Amplify integration could add login and saved game history.
- **Deploy**: Backend can run on Amazon EC2; set CORS and `VITE_WS_URL` (or equivalent) for the frontend to connect to the production WebSocket URL.
