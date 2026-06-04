const http = require("http")
const fs = require("fs")
const path = require("path")
const { WebSocketServer } = require("ws")

const { BOUNDS, DT, SEND_INTERVAL } = require("./constants")
const { genId } = require("./geometry")
const { createGame, updateGame, serializeState, initPlayerShip, initLevel } = require("./game")

const PORT = process.env.PORT || 10000
const FILE = path.join(__dirname, "..", "index.html")
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" }

let hits = 0
const seen = new Set()

const server = http.createServer((req, res) => {
  if (req.url === "/") {
    const html = fs.readFileSync(FILE, "utf-8")
    res.writeHead(200, { "Content-Type": "text/html" })
    res.end(html)
    return
  }
  const file = path.join(__dirname, "..", req.url)
  const ext = path.extname(file)
  if (fs.existsSync(file) && mime[ext]) {
    res.writeHead(200, { "Content-Type": mime[ext] })
    res.end(fs.readFileSync(file))
  } else {
    res.writeHead(404)
    res.end("not found")
  }
})

const wss = new WebSocketServer({ server })

// ---- Room management ----
const rooms = new Map()
const conns = new Map() // ws -> { roomId, playerId }

function send(ws, data) {
  try {
    ws.send(JSON.stringify(data))
  } catch {}
}

function handleDisconnect(ws) {
  const c = conns.get(ws)
  if (!c) return
  conns.delete(ws)
  const room = rooms.get(c.roomId)
  if (!room) return
  room.players.delete(ws)
  room.pids = room.pids.filter((p) => p !== c.playerId)
  delete room.game.ships[c.playerId]
  for (const [other] of room.players) send(other, { type: "playerLeft", playerId: c.playerId, players: room.pids })
  if (room.players.size === 0) {
    rooms.delete(c.roomId)
  }
}

function trackHit(ip) {
  if (!ip || seen.has(ip)) return
  seen.add(ip)
  hits++
}

wss.on("connection", (ws, req) => {
  trackHit(req.socket.remoteAddress)
  conns.set(ws, null)

  ws.on("message", (raw) => {
    let msg
    try {
      msg = JSON.parse(raw)
    } catch {
      return
    }

    if (msg.type === "create") {
      if (conns.get(ws)) return
      let id
      do {
        id = genId(4)
      } while (rooms.has(id))
      const pid = genId(4)
      const room = {
        id,
        players: new Map(),
        pids: [],
        owner: pid,
        game: createGame(),
        inputs: new Map(),
        tick: 0,
        sendCounter: 0,
      }
      room.players.set(ws, pid)
      room.pids.push(pid)
      room.game.ships[pid] = initPlayerShip()
      rooms.set(id, room)
      conns.set(ws, { roomId: id, playerId: pid })
      send(ws, { type: "created", room: id, playerId: pid })
    } else if (msg.type === "join") {
      if (conns.get(ws)) return
      const room = rooms.get(msg.room)
      if (!room || room.players.size >= 4) {
        send(ws, { type: "error", msg: "Room full or invalid" })
        return
      }
      const pid = genId(4)
      room.players.set(ws, pid)
      room.pids.push(pid)
      room.game.ships[pid] = initPlayerShip()
      if (room.game.step > 0) {
        const s = room.game.ships[pid]
        s.invuln = 2
        s.blink = 0
      }
      conns.set(ws, { roomId: msg.room, playerId: pid })
      const gameActive = room.game.running || room.game.step > 0
      if (!room.game.running && room.game.step > 0) {
        room.game.running = true
        if (room.game.asteroids.length === 0) initLevel(room.game)
      }
      send(ws, { type: "joined", room: msg.room, playerId: pid, players: room.pids, gameActive })
      if (gameActive) {
        send(ws, { type: "state", ...serializeState(room.game) })
      }
      for (const [other] of room.players) {
        if (other !== ws) send(other, { type: "playerJoined", playerId: pid, players: room.pids })
      }
    } else if (msg.type === "rooms") {
      const list = []
      for (const [id, room] of rooms) {
        list.push({ id, players: room.pids.length, max: 4, inGame: room.game.running })
      }
      send(ws, { type: "rooms", list, hits })
    } else if (msg.type === "start") {
      const c = conns.get(ws)
      if (!c) return
      const room = rooms.get(c.roomId)
      if (!room || room.owner !== c.playerId) return
      if (room.players.size < 1) return
      room.game = createGame()
      room.inputs = new Map()
      for (const pid of room.pids) room.game.ships[pid] = initPlayerShip()
      room.game.running = true
      initLevel(room.game)
      for (const [client] of room.players) send(client, { type: "gameStart" })
    } else if (msg.type === "input") {
      const c = conns.get(ws)
      if (!c) return
      const room = rooms.get(c.roomId)
      if (!room) return
      room.inputs.set(c.playerId, { keys: msg.keys || [], rot: msg.rot || 0 })
    } else if (msg.type === "leave") {
      handleDisconnect(ws)
    }
  })

  ws.on("close", () => handleDisconnect(ws))
  ws.on("error", () => handleDisconnect(ws))
})

// ---- Game loop per room ----
setInterval(() => {
  for (const [id, room] of rooms) {
    try {
      if (!room.game.running) continue
      room.tick++
      updateGame(room.game, DT, room.inputs)
      room.sendCounter++

      if (room.sendCounter >= SEND_INTERVAL) {
        room.sendCounter = 0
        const state = serializeState(room.game)
        for (const [client] of room.players) {
          send(client, { type: "state", ...state })
        }

        if (!room.game.running) {
          for (const [client] of room.players) {
            const scores = {}
            for (const [pid, s] of Object.entries(room.game.ships)) scores[pid] = s.score
            send(client, { type: "gameOver", scores })
          }
        }
      }
    } catch (e) {
      console.error(`room ${id} error:`, e)
    }
  }
}, DT * 1000)

server.listen(PORT, "0.0.0.0", () => console.log(`http://0.0.0.0:${PORT}`))
