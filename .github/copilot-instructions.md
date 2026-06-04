# Kraperoids – Copilot Instructions

## Running the project

```bash
npm start          # starts the server on port 6022 (or $PORT)
```

No build step, no bundler, no linter, no tests.

## Architecture

Kraperoids is a multiplayer browser asteroids game with a server-authoritative model.

### Server (`server/`)
Plain Node.js — no framework. Serves static files over HTTP and runs the game over WebSocket (`ws` package).

| File | Role |
|---|---|
| `index.js` | HTTP file server, WebSocket message router, room management, global game loop |
| `game.js` | Pure game logic: `createGame`, `updateGame`, `serializeState`, `initPlayerShip`, `initLevel` |
| `geometry.js` | Collision math: `bulletHitHull`, `wrap`, `rand`, `genId` |
| `constants.js` | Shared physics constants |

The global `setInterval` in `index.js` ticks all rooms at `DT = 1/30` s. State is broadcast to all players every tick (`SEND_INTERVAL = 1`).

### Client (`game.js`)
Single ES module, no bundler. Three.js is loaded from CDN via an importmap in `index.html`.

The client runs a `requestAnimationFrame` loop that:
1. Runs **client-side prediction** for the local ship (mirrors server physics exactly)
2. Sends key state to the server every frame via WebSocket
3. Lerps the local ship toward the latest server state (`LERP = 0.15`)
4. Renders the Three.js scene (OrthographicCamera mapping world coords directly to screen)

The server is authoritative for all collisions, scoring, asteroid state, and game-over detection. The client only predicts its own ship position and fires local bullets for visual responsiveness.

### Lobby state machine
The client cycles through three states managed by `setLobby(s)`:
- `lobby` — main menu, room list auto-refreshes every 5 s
- `room` — waiting room, owner sees Start button
- `game` — in-game, lobby UI hidden

## Key conventions

### World coordinates
Game space is `[-10, 10]` on both axes (`BOUNDS = 10`). All positions and radii are in these units. Objects wrap at the edges via `wrap()`.

### IDs
Room and player IDs are 4-character strings from `genId(4)`, using the alphabet `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (no ambiguous chars O, I, 0, 1).

### Constants duplication
`server/constants.js` (CommonJS) and inline constants in `game.js` (client) are **intentionally duplicated**. There is no shared module. If you change a physics constant (e.g., `BULLET_SPEED`, `SHIP_R`), update **both** files.

### Bullet tunneling prevention
Bullet and asteroid physics run **6 sub-steps per frame** inside `updateGame`. This prevents fast bullets from passing through small asteroids. Do not collapse these sub-steps into a single move.

### Serialization precision
`serializeState` intentionally rounds floats before sending over the wire:
- Positions: 3 decimal places
- Rotations: 3 decimal places
- `invuln`: 2 decimal places
- `blink`: 1 decimal place

### Object pooling
Bullets and particles on the client use reusable Three.js mesh pools (`bulletPool`, `particlePool`). Acquire with `getBulletMesh()` / `getParticleMesh()`, release by setting `.used = false` at the top of each render pass.

### Module systems
- Server: CommonJS (`require` / `module.exports`)
- Client: native ES module (`import`)

There is no transpilation; code must be compatible with modern Node.js and modern browsers as-is.
