const { BOUNDS } = require("./constants");

function edgeDistSq(px, py, ax, ay, bx, by) {
  const ex = bx - ax,
    ey = by - ay;
  const len2 = ex * ex + ey * ey;
  let t = ((px - ax) * ex + (py - ay) * ey) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * ex,
    cy = ay + t * ey;
  return (px - cx) ** 2 + (py - cy) ** 2;
}

function bulletHitHull(bx, by, _hull, r, ax, ay, px, py, aox, aoy) {
  const br = 0.15;
  const hitR = r + br;
  // endpoint check
  const dx = bx - ax;
  const dy = by - ay;
  if (dx * dx + dy * dy < hitR * hitR) return true;
  // start-of-substep asteroid position check
  const odx = bx - aox;
  const ody = by - aoy;
  if (odx * odx + ody * ody < hitR * hitR) return true;
  // segment check — did the bullet path cross the asteroid circle?
  return edgeDistSq(ax, ay, px, py, bx, by) < hitR * hitR;
}

function rand(min, max) {
  return Math.random() * (max - min) + min;
}

function genId(n) {
  const c = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < n; i++) s += c[Math.floor(Math.random() * c.length)];
  return s;
}

function wrap(obj) {
  const m = 1.5;
  if (obj.x > BOUNDS + m) obj.x = -BOUNDS - m;
  else if (obj.x < -BOUNDS - m) obj.x = BOUNDS + m;
  if (obj.y > BOUNDS + m) obj.y = -BOUNDS - m;
  else if (obj.y < -BOUNDS - m) obj.y = BOUNDS + m;
}

module.exports = {
  edgeDistSq,
  bulletHitHull,
  rand,
  genId,
  wrap,
};
