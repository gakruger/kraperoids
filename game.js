import * as THREE from "three"

const BOUNDS = 10
const DT_MAX = 0.033
const SHIP_R = 0.5
const ASTEROID_R = [1.5, 1.0, 0.5]
const LERP = 0.15

// ---- WebSocket ----
let ws = null
let playerId = null
let roomId = null
let gameActive = false
let players = []
let serverState = null
let keys = new Set()
let earlyOutShown = false

// ---- Lobby ----
const lobbyEl = document.getElementById("lobby")
const createBtn = document.getElementById("createBtn")
const joinBtn = document.getElementById("joinBtn")
const joinInput = document.getElementById("joinInput")
const roomCode = document.getElementById("roomCode")
const playerList = document.getElementById("playerList")
const startBtn = document.getElementById("startBtn")
const leaveBtn = document.getElementById("leaveBtn")
const refreshBtn = document.getElementById("refreshBtn")
const roomList = document.getElementById("roomList")
const errEl = document.getElementById("err")
const roomInfo = document.getElementById("roomInfo")
const uiEl = document.getElementById("ui")
const scoreEl = document.getElementById("score")
const playersUI = document.getElementById("players-ui")
const livesEl = document.getElementById("lives")
const overEl = document.getElementById("over")
const finalScores = document.getElementById("finalScores")
const backBtn = document.getElementById("backBtn")

function sendWs(msg) {
  try {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg))
      return true
    }
  } catch {}
  return false
}

let reconnectTimer = null
let connGen = 0
function connect() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  connGen++
  const gen = connGen
  if (ws) {
    try {
      ws.close()
    } catch {}
  }
  ws = new WebSocket(`ws://${location.host}`)
  ws.onmessage = onMsg
  ws.onopen = () => {
    if (lobbyState === "lobby") startRoomsRefresh()
  }
  ws.onclose = () => {
    stopRoomsRefresh()
    if (lobbyState === "lobby")
      reconnectTimer = setTimeout(() => {
        if (connGen === gen) connect()
      }, 2000)
  }
  ws.onerror = () => {}
}

let lobbyState = "lobby" // lobby | room | game

function setLobby(s) {
  lobbyState = s
  lobbyEl.style.display = s === "game" ? "none" : ""
  uiEl.style.display = s === "game" ? "" : "none"
  const inLobby = s === "lobby"
  createBtn.disabled = !inLobby
  joinBtn.disabled = !inLobby
  if (s === "room") {
    roomInfo.style.display = ""
    stopRoomsRefresh()
  } else if (s === "lobby") {
    roomInfo.style.display = "none"
    startRoomsRefresh()
  } else {
    roomInfo.style.display = "none"
  }
}

function showErr(m) {
  errEl.textContent = m
}

function onMsg(e) {
  let msg
  try {
    msg = JSON.parse(e.data)
  } catch {
    return
  }

  try {
    if (msg.type === "created") {
      playerId = msg.playerId
      roomId = msg.room
      players = [msg.playerId]
      roomCode.textContent = msg.room
      errEl.textContent = ""
      startBtn.style.display = ""
      setLobby("room")
      updatePlayerList(players)
    } else if (msg.type === "joined") {
      playerId = msg.playerId
      roomId = msg.room
      players = msg.players
      roomCode.textContent = msg.room
      errEl.textContent = ""
      startBtn.style.display = "none"
      if (msg.gameActive) {
        startGame()
      } else {
        setLobby("room")
      }
      updatePlayerList(players)
    } else if (msg.type === "playerJoined") {
      players = msg.players
      updatePlayerList(players)
    } else if (msg.type === "playerLeft") {
      const me = msg.players.includes(playerId)
      players = msg.players
      if (!me) {
        setLobby("lobby")
        roomId = null
        playerId = null
      } else {
        updatePlayerList(players)
      }
    } else if (msg.type === "error") {
      showErr(msg.msg)
    } else if (msg.type === "rooms") {
      renderRoomList(msg.list)
      const el = document.getElementById("hits")
      if (el && msg.hits != null) el.textContent = `${msg.hits}`
    } else if (msg.type === "gameStart") {
      startGame()
    } else if (msg.type === "state") {
      serverState = msg
      const ms = msg.ships[playerId]
      if (ms && ms.lives <= 0 && msg.running && !earlyOutShown) {
        earlyOutShown = true
        let h = ""
        for (const [pid, s] of Object.entries(msg.ships)) {
          const me = pid === playerId ? ' class="me"' : ""
          h += `<div${me}>${pid === playerId ? "★ " : ""}Player ${pid.slice(0, 4)}: ${s.score}</div>`
        }
        finalScores.innerHTML = h
        document.querySelector("#over h1").textContent = "HONK!"
        overEl.style.display = "block"
      }
    } else if (msg.type === "gameOver") {
      gameActive = false
      earlyOutShown = false
      const scores = msg.scores
      let html = ""
      for (const [pid, sc] of Object.entries(scores)) {
        const me = pid === playerId ? ' class="me"' : ""
        html += `<div${me}>${pid === playerId ? "★ " : ""}Player ${pid.slice(0, 4)}: ${sc}</div>`
      }
      finalScores.innerHTML = html
      document.querySelector("#over h1").textContent = "HONK!"
      localBullets = []
      overEl.style.display = "block"
    }
  } catch (e) {
    console.error("onMsg error:", e)
  }
}

function updatePlayerList(pids) {
  let html = ""
  for (const p of pids) {
    const me = p === playerId ? " ★" : ""
    html += `<span>${p.slice(0, 4)}${me}</span>`
  }
  playerList.innerHTML = html
}

function requestRooms() {
  sendWs({ type: "rooms" })
}

function renderRoomList(rooms) {
  if (!rooms || rooms.length === 0) {
    roomList.innerHTML = '<div class="no-rooms">No active rooms</div>'
    return
  }
  let html = ""
  for (const r of rooms) {
    const full = r.players >= r.max
    const cls = full ? "room-entry full" : "room-entry"
    const label = r.inGame ? `In game (${r.players}/${r.max})` : `${r.players}/${r.max}`
    html += `<div class="${cls}" data-room="${r.id}">
      <span class="code">${r.id}</span>
      <span class="meta">${label}</span>
    </div>`
  }
  roomList.innerHTML = html
  // click-to-join
  for (const el of roomList.querySelectorAll(".room-entry:not(.full)")) {
    el.addEventListener("click", () => {
      const code = el.dataset.room
      joinInput.value = code
      sendWs({ type: "join", room: code })
    })
  }
}

// auto-refresh rooms periodically when in lobby
let roomsInterval = null
function startRoomsRefresh() {
  stopRoomsRefresh()
  requestRooms()
  roomsInterval = setInterval(requestRooms, 5000)
}
function stopRoomsRefresh() {
  if (roomsInterval) {
    clearInterval(roomsInterval)
    roomsInterval = null
  }
}

createBtn.addEventListener("click", () => {
  if (lobbyState !== "lobby") return
  sendWs({ type: "create" })
})
joinBtn.addEventListener("click", () => {
  if (lobbyState !== "lobby") return
  const code = joinInput.value.trim().toUpperCase()
  if (code.length < 4) {
    showErr("Enter a 4-char code")
    return
  }
  sendWs({ type: "join", room: code })
})
joinInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") joinBtn.click()
})

document.addEventListener("keydown", (e) => {
  keys.add(e.key)
  if (e.key === " ") e.preventDefault()
})
document.addEventListener("keyup", (e) => keys.delete(e.key))

startBtn.addEventListener("click", () => {
  sendWs({ type: "start" })
})
leaveBtn.addEventListener("click", () => {
  sendWs({ type: "leave" })
  if (ws) ws.close()
  setLobby("lobby")
  roomId = null
  playerId = null
  players = []
  connect()
})
backBtn.addEventListener("click", () => {
  overEl.style.display = "none"
  gameActive = false
  setLobby("lobby")
  roomId = null
  playerId = null
  players = []
  if (ws) ws.close()
  connect()
})

let aCtx = null
function honk() {
  if (!aCtx) aCtx = new (window.AudioContext || window.webkitAudioContext)()
  if (aCtx.state === "suspended") aCtx.resume()
  const t = aCtx.currentTime
  const o1 = aCtx.createOscillator()
  const o2 = aCtx.createOscillator()
  const g = aCtx.createGain()
  o1.type = "sawtooth"
  o2.type = "sawtooth"
  o2.detune.value = 15
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(0.15, t + 0.02)
  g.gain.linearRampToValueAtTime(0.12, t + 0.12)
  g.gain.linearRampToValueAtTime(0, t + 0.25)
  o1.frequency.setValueAtTime(350, t)
  o1.frequency.linearRampToValueAtTime(650, t + 0.06)
  o1.frequency.linearRampToValueAtTime(450, t + 0.18)
  o1.frequency.linearRampToValueAtTime(350, t + 0.25)
  o2.frequency.setValueAtTime(350, t)
  o2.frequency.linearRampToValueAtTime(650, t + 0.06)
  o2.frequency.linearRampToValueAtTime(450, t + 0.18)
  o2.frequency.linearRampToValueAtTime(350, t + 0.25)
  o1.connect(g)
  o2.connect(g)
  g.connect(aCtx.destination)
  o1.start(t)
  o2.start(t)
  o1.stop(t + 0.25)
  o2.stop(t + 0.25)
}

document.querySelector("#over h1").addEventListener("click", honk)

// ---- Three.js scene ----
const scene = new THREE.Scene()
const camera = new THREE.OrthographicCamera(-BOUNDS, BOUNDS, BOUNDS, -BOUNDS, 0.1, 100)
camera.position.z = 20
const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
document.body.prepend(renderer.domElement)

const ambientLight = new THREE.AmbientLight(0x444466, 0.6)
scene.add(ambientLight)
const dirLight = new THREE.DirectionalLight(0xffffff, 1.5)
dirLight.position.set(4, 6, 10)
scene.add(dirLight)

window.addEventListener("resize", () => {
  const w = window.innerWidth
  const h = window.innerHeight
  const a = w / h
  camera.left = -BOUNDS * a
  camera.right = BOUNDS * a
  camera.top = BOUNDS
  camera.bottom = -BOUNDS
  camera.updateProjectionMatrix()
  renderer.setSize(w, h)
})

// ---- Starfield ----
const starCount = 500
const starPos = new Float32Array(starCount * 3)
for (let i = 0; i < starCount; i++) {
  starPos[i * 3] = (Math.random() - 0.5) * 60
  starPos[i * 3 + 1] = (Math.random() - 0.5) * 60
  starPos[i * 3 + 2] = Math.random() * -30 - 5
}
const starGeo = new THREE.BufferGeometry()
starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3))
const stars = new THREE.Points(
  starGeo,
  new THREE.PointsMaterial({ color: 0xffffff, size: 2.5, sizeAttenuation: false }),
)
scene.add(stars)

// ---- Ship meshes ----
function makeShipMesh(color) {
  const shape = new THREE.Shape()
  shape.moveTo(0, 0.6)
  shape.lineTo(-0.4, -0.4)
  shape.lineTo(0, -0.2)
  shape.lineTo(0.4, -0.4)
  shape.closePath()

  const ship = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({ color }))

  const flameShape = new THREE.Shape()
  flameShape.moveTo(0, -0.5)
  flameShape.lineTo(-0.12, 0)
  flameShape.lineTo(0.12, 0)
  flameShape.closePath()

  const outer = new THREE.Mesh(new THREE.ShapeGeometry(flameShape), new THREE.MeshBasicMaterial({ color: 0xff4400 }))
  outer.position.y = -0.35
  outer.scale.y = 0
  ship.add(outer)

  const inner = new THREE.Mesh(new THREE.ShapeGeometry(flameShape), new THREE.MeshBasicMaterial({ color: 0xffaa00 }))
  inner.position.y = -0.35
  inner.scale.y = 0
  ship.add(inner)

  const core = new THREE.Mesh(new THREE.ShapeGeometry(flameShape), new THREE.MeshBasicMaterial({ color: 0xffee88 }))
  core.position.y = -0.35
  core.scale.y = 0
  ship.add(core)

  return { group: ship, outer, inner, core }
}

const SHIP_COLORS = [0xffffff, 0x44ddff, 0xffdd44, 0xff66aa]
const shipData = new Map() // playerId -> { group, outer, inner, core, flameTime }

function getOrCreateShip(pid, color) {
  let d = shipData.get(pid)
  if (!d) {
    d = makeShipMesh(color)
    d.group.visible = false
    scene.add(d.group)
    d.flameTime = 0
    shipData.set(pid, d)
  }
  return d
}

// ---- Asteroid meshes ----
function makeAsteroidMesh(r) {
  const geo = new THREE.IcosahedronGeometry(r, 1)
  const pos = geo.attributes.position
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)
    const len = Math.sqrt(x * x + y * y + z * z)
    // angular jitter: offset vertex then renormalize to keep radius = r
    const jx = x + (Math.random() - 0.5) * r * 0.2
    const jy = y + (Math.random() - 0.5) * r * 0.2
    const jz = z + (Math.random() - 0.5) * r * 0.2
    const jl = Math.sqrt(jx * jx + jy * jy + jz * jz)
    pos.setXYZ(i, (jx / jl) * r, (jy / jl) * r, (jz / jl) * r)
  }
  pos.needsUpdate = true
  geo.computeVertexNormals()
  return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xaaaaaa }))
}

const asteroidMeshes = new Map() // id -> mesh

// ---- Bullets ----
const bulletPool = []
let localBullets = []

function makeBulletMesh() {
  const g = new THREE.Group()
  const inner = new THREE.Mesh(new THREE.CircleGeometry(0.06, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }))
  inner.position.z = 0.1
  g.add(inner)
  g.visible = false
  scene.add(g)
  return { g, used: false }
}

function getBulletMesh() {
  let m = bulletPool.find((b) => !b.used)
  if (!m) {
    m = makeBulletMesh()
    bulletPool.push(m)
  }
  m.used = true
  m.g.visible = true
  return m
}

// ---- Particles ----
const particlePool = []
const PARTICLE_COLORS = [
  0xff3333, 0xff6633, 0xffaa33, 0xffff33, 0x33ff33, 0x33ffff, 0x3388ff, 0xff33ff, 0xff66aa, 0xffffff,
]

function getParticleMesh() {
  let m = particlePool.find((p) => !p.used)
  if (!m) {
    const geo = new THREE.SphereGeometry(0.05, 4, 4)
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xaaaaaa }))
    mesh.visible = false
    scene.add(mesh)
    m = { mesh, used: false }
    particlePool.push(m)
  }
  m.used = true
  m.mesh.visible = true
  m.mesh.material.color.setHex(PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)])
  return m
}

// ---- Planet ----
const PLANET_R = 1.2

const canv = document.createElement("canvas")
canv.width = 768
canv.height = 256
const ctx = canv.getContext("2d")
ctx.fillStyle = "#0c0c14"
ctx.fillRect(0, 0, canv.width, canv.height)

function drawHole(cx, cy, rx, ry) {
  ctx.beginPath()
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
  ctx.fillStyle = "#030308"
  ctx.fill()
  ctx.beginPath()
  ctx.ellipse(cx - 0.5, cy - 0.5, rx - 1, ry - 1, 0, Math.PI * 1.2, Math.PI * 1.8)
  ctx.strokeStyle = "rgba(255,255,255,0.15)"
  ctx.lineWidth = 1.5
  ctx.stroke()
}

drawHole(378, 140, 14, 12)
drawHole(366, 108, 10, 9)
drawHole(392, 108, 10, 9)

ctx.textAlign = "center"
ctx.textBaseline = "middle"
ctx.font = "bold 42px monospace"
const txt = "PlanetCrap"
for (let i = 0; i < txt.length; i++) {
  const t = i / (txt.length - 1)
  const x = 250 + t * 260
  const y = 62 - Math.sin(t * Math.PI) * 10
  const rot = Math.cos(t * Math.PI) * -0.2
  ctx.fillStyle = "rgba(180,220,255,0.15)"
  ctx.save()
  ctx.translate(x - 1, y - 2)
  ctx.rotate(rot)
  ctx.fillText(txt[i], 0, 0)
  ctx.restore()
  ctx.fillStyle = "rgba(0,0,0,0.6)"
  ctx.save()
  ctx.translate(x + 1, y + 2)
  ctx.rotate(rot)
  ctx.fillText(txt[i], 0, 0)
  ctx.restore()
  ctx.fillStyle = "#7fc8e3"
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(rot)
  ctx.fillText(txt[i], 0, 0)
  ctx.restore()
}

const planetTex = new THREE.CanvasTexture(canv)
const planetMesh = new THREE.Mesh(
  new THREE.SphereGeometry(PLANET_R, 24, 24),
  new THREE.MeshStandardMaterial({ map: planetTex, roughness: 0.25, metalness: 0 }),
)
planetMesh.visible = false
scene.add(planetMesh)

// ---- Local ship prediction ----
let localShip = { x: 0, y: 0, vx: 0, vy: 0, rot: 0, flameTime: 0 }
let lastFire = 0

// ---- Attract mode ----
let attractPlanet = { x: -13, y: 4, vx: 0.3, vy: -0.1, rotX: 0, rotY: 0 }
function resetAttract() {
  attractPlanet.x = -13
  attractPlanet.y = (Math.random() - 0.5) * 12
  attractPlanet.vx = 0.2 + Math.random() * 0.3
  attractPlanet.vy = (Math.random() - 0.5) * 0.2
  attractPlanet.rotX = 0
  attractPlanet.rotY = 0
}

function updateAttract(dt) {
  attractPlanet.x += attractPlanet.vx * dt
  attractPlanet.y += attractPlanet.vy * dt
  attractPlanet.rotX += dt * 0.5
  attractPlanet.rotY += dt * 0.3
  const m = 3
  if (attractPlanet.x > BOUNDS + m) {
    attractPlanet.x = -BOUNDS - m
    attractPlanet.vx = 0.2 + Math.random() * 0.3
  }
  if (attractPlanet.x < -BOUNDS - m) resetAttract()
  if (attractPlanet.y > BOUNDS + m || attractPlanet.y < -BOUNDS - m) attractPlanet.vy *= -1
}

function updateLocalShip(dt) {
  const left = keys.has("ArrowLeft")
  const right = keys.has("ArrowRight")
  const up = keys.has("ArrowUp")
  const fire = keys.has(" ")

  if (left) localShip.rot += 4 * dt
  if (right) localShip.rot -= 4 * dt

  if (up) {
    localShip.vx += -Math.sin(localShip.rot) * 8 * dt
    localShip.vy += Math.cos(localShip.rot) * 8 * dt
  }
  const spd = Math.sqrt(localShip.vx * localShip.vx + localShip.vy * localShip.vy)
  if (spd > 6) {
    localShip.vx = (localShip.vx / spd) * 6
    localShip.vy = (localShip.vy / spd) * 6
  }
  localShip.vx *= 0.99
  localShip.vy *= 0.99
  localShip.x += localShip.vx * dt
  localShip.y += localShip.vy * dt

  const m = 1.5
  if (localShip.x > BOUNDS + m) localShip.x = -BOUNDS - m
  else if (localShip.x < -BOUNDS - m) localShip.x = BOUNDS + m
  if (localShip.y > BOUNDS + m) localShip.y = -BOUNDS - m
  else if (localShip.y < -BOUNDS - m) localShip.y = BOUNDS + m

  // fire while held (game loop, not key repeat)
  const now = performance.now()
  if (fire && now - lastFire >= 333 && localBullets.length < 5) {
    lastFire = now
    const dx = -Math.sin(localShip.rot)
    const dy = Math.cos(localShip.rot)
    localBullets.push({
      x: localShip.x + dx * 0.7,
      y: localShip.y + dy * 0.7,
      vx: dx * 14,
      vy: dy * 14,
      life: 1.2,
    })
  }

  // send input to server every frame
  const k = []
  if (left) k.push("ArrowLeft")
  if (right) k.push("ArrowRight")
  if (up) k.push("ArrowUp")
  if (fire) k.push(" ")
  sendWs({ type: "input", keys: k, rot: localShip.rot })
}

// ---- State ----
let prevAsteroidIds = new Set()

function startGame() {
  gameActive = true
  earlyOutShown = false
  overEl.style.display = "none"
  stopRoomsRefresh()
  setLobby("game")
  localShip = { x: 0, y: 0, vx: 0, vy: 0, rot: 0, flameTime: 0 }
  serverState = null
  shipData.forEach((d) => {
    d.group.visible = false
  })
  for (const [id, m] of asteroidMeshes) {
    scene.remove(m)
    m.geometry.dispose()
  }
  asteroidMeshes.clear()
  for (const b of bulletPool) {
    b.used = false
    b.g.visible = false
  }
  localBullets = []
  for (const p of particlePool) {
    p.used = false
    p.mesh.visible = false
  }
  prevAsteroidIds = new Set()
  planetMesh.visible = false
}

function updateFlame(d, thrusting, dt) {
  if (thrusting) {
    d.flameTime += dt * 20
    const f = 0.85 + Math.sin(d.flameTime) * 0.15
    const len = 1 + Math.sin(d.flameTime * 1.7) * 0.3
    d.outer.scale.set(1, (1.2 + len * 0.8) * f, 1)
    d.inner.scale.set(0.7, (1.4 + len) * f, 1)
    d.core.scale.set(0.5, (1.6 + len * 1.2) * f, 1)
  } else {
    d.outer.scale.y *= 0.85
    d.inner.scale.y *= 0.85
    d.core.scale.y *= 0.85
    if (d.outer.scale.y < 0.01) d.outer.scale.y = 0
    if (d.inner.scale.y < 0.01) d.inner.scale.y = 0
    if (d.core.scale.y < 0.01) d.core.scale.y = 0
  }
}

function render(dt) {
  const st = serverState

  if (gameActive && st) {
    // ---- Own ship ----
    if (!st.running) {
      for (const [, d] of shipData) d.group.visible = false
    }
    const me = st.ships[playerId]
    if (me) {
      localShip.x += (me.x - localShip.x) * LERP
      localShip.y += (me.y - localShip.y) * LERP
      localShip.vx += (me.vx - localShip.vx) * LERP
      localShip.vy += (me.vy - localShip.vy) * LERP
    }

    // ---- Other ships ----
    for (const [pid, s] of Object.entries(st.ships)) {
      if (pid === playerId) continue
      const idx = players.indexOf(pid)
      const colorIdx = idx >= 0 ? idx % SHIP_COLORS.length : 0
      const d = getOrCreateShip(pid, SHIP_COLORS[colorIdx])
      d.group.position.set(s.x, s.y, 0)
      d.group.rotation.z = s.rot
      d.group.visible = true
      if (s.invuln > 0) d.group.visible = Math.floor(s.blink) % 2 === 0
      updateFlame(d, s.thrusting, dt)
    }

    // own ship rendering
    const myIdx = players.indexOf(playerId)
    const myColorIdx = myIdx >= 0 ? myIdx % SHIP_COLORS.length : 0
    const myShip = getOrCreateShip(playerId, SHIP_COLORS[myColorIdx])
    myShip.group.position.set(localShip.x, localShip.y, 0)
    myShip.group.rotation.z = localShip.rot
    myShip.group.visible = true
    if (me && me.invuln > 0) myShip.group.visible = Math.floor(me.blink) % 2 === 0
    updateFlame(myShip, keys.has("ArrowUp"), dt)
    for (const [pid, d] of shipData) {
      if (!st.ships[pid] || st.ships[pid].lives <= 0) d.group.visible = false
    }

    // ---- Asteroids ----
    const currIds = new Set(st.asteroids.map((a) => a.id))
    for (const id of prevAsteroidIds) {
      if (!currIds.has(id)) {
        const m = asteroidMeshes.get(id)
        if (m) {
          scene.remove(m)
          m.geometry.dispose()
          asteroidMeshes.delete(id)
        }
      }
    }
    for (const a of st.asteroids) {
      let m = asteroidMeshes.get(a.id)
      if (!m) {
        m = makeAsteroidMesh(a.r)
        scene.add(m)
        asteroidMeshes.set(a.id, m)
      }
      m.position.set(a.x, a.y, 0)
      m.rotation.x = a.rotX
      m.rotation.y = a.rotY
    }
    prevAsteroidIds = currIds

    // ---- Bullets ----
    for (const b of bulletPool) b.used = false
    for (const b of st.bullets) {
      if (b.owner === playerId) continue
      const m = getBulletMesh()
      m.g.position.set(b.x, b.y, 0)
    }
    for (const b of localBullets) {
      const m = getBulletMesh()
      m.g.position.set(b.x, b.y, 0)
    }
    for (const b of bulletPool) {
      if (!b.used) b.g.visible = false
    }

    // ---- Particles ----
    for (const p of particlePool) p.used = false
    for (const p of st.particles) {
      const m = getParticleMesh()
      m.mesh.position.set(p.x, p.y, 0)
      const a = Math.max(0, p.life / 0.6)
      m.mesh.material.opacity = a
      m.mesh.material.transparent = true
    }
    for (const p of particlePool) {
      if (!p.used) p.mesh.visible = false
    }

    // ---- Planet ----
    if (st.planet.active) {
      planetMesh.position.set(st.planet.x, st.planet.y, 0)
      planetMesh.visible = true
      planetMesh.rotation.x += 0.5 * dt
      planetMesh.rotation.y += 0.3 * dt
    } else {
      planetMesh.visible = false
    }

    // ---- UI ----
    if (me) {
      scoreEl.textContent = `Score: ${me.score}`
      livesEl.textContent = "♥ ".repeat(Math.max(0, me.lives)).trim()
    }
    let ph = ""
    for (const [pid, s] of Object.entries(st.ships)) {
      const meFlag = pid === playerId ? " you" : ""
      const label = pid === playerId ? "You" : pid.slice(0, 4)
      ph += `<span class="${meFlag}">${label}: ${s.score}</span>`
    }
    playersUI.innerHTML = ph
  } else {
    for (const [, d] of shipData) d.group.visible = false
    for (const [, m] of asteroidMeshes) m.visible = false
    for (const b of bulletPool) b.g.visible = false
    for (const p of particlePool) p.mesh.visible = false
    planetMesh.position.set(attractPlanet.x, attractPlanet.y, 0)
    planetMesh.rotation.x = attractPlanet.rotX
    planetMesh.rotation.y = attractPlanet.rotY
    planetMesh.visible = true
  }

  renderer.render(scene, camera)
}

// ---- Game loop ----
let last = performance.now()

function loop(now) {
  const dt = Math.min((now - last) / 1000, DT_MAX)
  last = now

  stars.rotation.z += dt * 0.015

  if (!gameActive) updateAttract(dt)

  if (gameActive && playerId) {
    try {
      updateLocalShip(dt)
    } catch (e) {
      console.error("updateLocalShip error:", e)
    }
    for (let i = localBullets.length - 1; i >= 0; i--) {
      const b = localBullets[i]
      b.x += b.vx * dt
      b.y += b.vy * dt
      b.life -= dt
      if (b.life <= 0 || Math.abs(b.x) > BOUNDS || Math.abs(b.y) > BOUNDS) {
        localBullets.splice(i, 1)
      }
    }
  }
  try {
    render(dt)
  } catch (e) {
    console.error("render error:", e)
  }

  requestAnimationFrame(loop)
}

connect()
loop(performance.now())
