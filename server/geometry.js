const { BOUNDS } = require("./constants")

const BASE_VERTS = (() => {
  const phi = (1 + Math.sqrt(5)) / 2
  const n = 1 / Math.sqrt(1 + phi * phi)
  const raw = [
    [0, -1, -phi],
    [0, -1, phi],
    [0, 1, -phi],
    [0, 1, phi],
    [-1, -phi, 0],
    [-1, phi, 0],
    [1, -phi, 0],
    [1, phi, 0],
    [-phi, 0, -1],
    [-phi, 0, 1],
    [phi, 0, -1],
    [phi, 0, 1],
  ]
  return raw.map(([x, y, z]) => [x * n, y * n, z * n])
})()

function asteroidHull(a) {
  const rx = a.rotX,
    ry = a.rotY
  const cosX = Math.cos(rx),
    sinX = Math.sin(rx)
  const cosY = Math.cos(ry),
    sinY = Math.sin(ry)
  const pts = BASE_VERTS.map(([x, y, z]) => [
    (x * cosY + y * sinX * sinY + z * cosX * sinY) * a.r + a.x,
    (y * cosX - z * sinX) * a.r + a.y,
  ])
  let left = 0
  for (let i = 1; i < pts.length; i++) {
    if (pts[i][0] < pts[left][0]) left = i
  }
  const hull = []
  let p = left
  do {
    hull.push(pts[p])
    let next = (p + 1) % pts.length
    for (let i = 0; i < pts.length; i++) {
      if (i === p) continue
      const cross =
        (pts[i][0] - pts[p][0]) * (pts[next][1] - pts[p][1]) - (pts[i][1] - pts[p][1]) * (pts[next][0] - pts[p][0])
      if (cross < 0) next = i
    }
    p = next
  } while (p !== left)
  return hull
}

function pointInHull(px, py, hull) {
  let sign = 0
  for (let i = 0; i < hull.length; i++) {
    const j = (i + 1) % hull.length
    const cross = (hull[j][0] - hull[i][0]) * (py - hull[i][1]) - (hull[j][1] - hull[i][1]) * (px - hull[i][0])
    if (cross !== 0) {
      const s = cross > 0 ? 1 : -1
      if (sign === 0) sign = s
      else if (s !== sign) return false
    }
  }
  return true
}

function edgeDistSq(px, py, ax, ay, bx, by) {
  const ex = bx - ax,
    ey = by - ay
  const len2 = ex * ex + ey * ey
  let t = ((px - ax) * ex + (py - ay) * ey) / len2
  t = Math.max(0, Math.min(1, t))
  const cx = ax + t * ex,
    cy = ay + t * ey
  return (px - cx) ** 2 + (py - cy) ** 2
}

function bulletHitHull(bx, by, hull, r) {
  if (pointInHull(bx, by, hull)) return true
  const M = Math.max(0.15, r * 0.2)
  for (let k = 0; k < hull.length; k++) {
    const l = (k + 1) % hull.length
    if (edgeDistSq(bx, by, hull[k][0], hull[k][1], hull[l][0], hull[l][1]) < M * M) return true
  }
  return false
}

function rand(min, max) {
  return Math.random() * (max - min) + min
}

function genId(n) {
  const c = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  let s = ""
  for (let i = 0; i < n; i++) s += c[Math.floor(Math.random() * c.length)]
  return s
}

function wrap(obj) {
  const m = 1.5
  if (obj.x > BOUNDS + m) obj.x = -BOUNDS - m
  else if (obj.x < -BOUNDS - m) obj.x = BOUNDS + m
  if (obj.y > BOUNDS + m) obj.y = -BOUNDS - m
  else if (obj.y < -BOUNDS - m) obj.y = BOUNDS + m
}

module.exports = { asteroidHull, pointInHull, edgeDistSq, bulletHitHull, rand, genId, wrap }
