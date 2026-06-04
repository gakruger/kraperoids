const {
  BOUNDS,
  SHIP_R,
  BULLET_SPEED,
  BULLET_LIFE,
  ASTEROID_R,
  ASTEROID_SCORE,
  PLANET_R,
  PLANET_SPEED,
} = require("./constants");
const { edgeDistSq, bulletHitHull, rand, wrap } = require("./geometry");

function createGame() {
  return {
    ships: {},
    asteroids: [],
    bullets: [],
    particles: [],
    planet: { x: 0, y: 0, vx: 0, vy: 0, active: false, timer: rand(20, 45) },
    level: 1,
    running: false,
    aidSeq: 0,
    step: 0,
  };
}

function makeAsteroid(g, r, x, y, vx, vy) {
  g.asteroids.push({
    id: g.aidSeq++,
    x,
    y,
    vx,
    vy,
    rotX: 0,
    rotY: 0,
    r,
    size: ASTEROID_R.indexOf(r),
  });
}

function spawnAsteroid(g, r) {
  const edge = Math.floor(rand(0, 4));
  let x, y;
  if (edge === 0) {
    x = rand(-BOUNDS, BOUNDS);
    y = -BOUNDS - 2;
  } else if (edge === 1) {
    x = BOUNDS + 2;
    y = rand(-BOUNDS, BOUNDS);
  } else if (edge === 2) {
    x = rand(-BOUNDS, BOUNDS);
    y = BOUNDS + 2;
  } else {
    x = -BOUNDS - 2;
    y = rand(-BOUNDS, BOUNDS);
  }
  const a = rand(0, Math.PI * 2);
  const s = rand(0.5, 1.5);
  makeAsteroid(g, r, x, y, Math.cos(a) * s, Math.sin(a) * s);
}

function initLevel(g) {
  const n = 4 + g.level;
  for (let i = 0; i < n; i++) {
    let x, y;
    do {
      x = rand(-BOUNDS * 0.7, BOUNDS * 0.7);
      y = rand(-BOUNDS * 0.7, BOUNDS * 0.7);
    } while (x * x + y * y < 9);
    const a = rand(0, Math.PI * 2);
    const s = rand(0.3, 1);
    makeAsteroid(g, ASTEROID_R[0], x, y, Math.cos(a) * s, Math.sin(a) * s);
  }
}

function spawnParticles(g, x, y, n) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, Math.PI * 2);
    const s = rand(1, 4);
    g.particles.push({
      x,
      y,
      vx: Math.cos(a) * s * rand(0.5, 1),
      vy: Math.sin(a) * s * rand(0.5, 1),
      life: rand(0.3, 0.6),
    });
  }
}

function spawnConfetti(g, x, y) {
  for (let i = 0; i < 150; i++) {
    const a = rand(0, Math.PI * 2);
    const s = rand(3, 12);
    g.particles.push({
      x,
      y,
      vx: Math.cos(a) * s * rand(0.5, 1),
      vy: Math.sin(a) * s * rand(0.5, 1),
      life: rand(0.8, 2.0),
    });
  }
}

function splitAsteroid(g, a) {
  const idx = a.size;
  if (idx < 2) {
    const r = ASTEROID_R[idx + 1];
    for (let i = 0; i < 2; i++) {
      const angle = rand(0, Math.PI * 2);
      const speed = rand(1, 2.5);
      makeAsteroid(
        g,
        r,
        a.x,
        a.y,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
      );
    }
  }
}

function hitAsteroid(g, a, owner) {
  if (g.ships[owner]) g.ships[owner].score += ASTEROID_SCORE[a.size];
  spawnParticles(g, a.x, a.y, 12);
  splitAsteroid(g, a);
}

function initPlayerShip() {
  return {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    rot: 0,
    score: 0,
    lives: 3,
    invuln: 0,
    blink: 0,
    thrusting: false,
    lastFire: 0,
  };
}

function updateGame(g, dt, inputs) {
  if (!g.running) return;
  g.step++;

  // planet
  const p = g.planet;
  if (!p.active) {
    p.timer -= dt;
    if (p.timer <= 0) {
      const edge = Math.floor(rand(0, 4));
      if (edge === 0) {
        p.x = rand(-4, 4);
        p.y = -BOUNDS - 3;
        p.vx = rand(-1, 1);
        p.vy = PLANET_SPEED;
      } else if (edge === 1) {
        p.x = BOUNDS + 3;
        p.y = rand(-4, 4);
        p.vx = -PLANET_SPEED;
        p.vy = rand(-1, 1);
      } else if (edge === 2) {
        p.x = rand(-4, 4);
        p.y = BOUNDS + 3;
        p.vx = rand(-1, 1);
        p.vy = -PLANET_SPEED;
      } else {
        p.x = -BOUNDS - 3;
        p.y = rand(-4, 4);
        p.vx = PLANET_SPEED;
        p.vy = rand(-1, 1);
      }
      p.active = true;
    }
  } else {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    const m = 3;
    if (
      p.x > BOUNDS + m ||
      p.x < -BOUNDS - m ||
      p.y > BOUNDS + m ||
      p.y < -BOUNDS - m
    ) {
      p.active = false;
      p.timer = rand(20, 45);
    }
  }

  // ships
  for (const [pid, s] of Object.entries(g.ships)) {
    if (s.lives <= 0) continue;
    const inp = inputs.get(pid) || { keys: [], rot: s.rot };
    const keys = inp.keys;

    if (keys.includes("ArrowLeft")) s.rot += 4 * dt;
    if (keys.includes("ArrowRight")) s.rot -= 4 * dt;

    s.thrusting = keys.includes("ArrowUp");
    if (s.thrusting) {
      s.vx += -Math.sin(s.rot) * 8 * dt;
      s.vy += Math.cos(s.rot) * 8 * dt;
    }
    const spd = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
    if (spd > 6) {
      s.vx = (s.vx / spd) * 6;
      s.vy = (s.vy / spd) * 6;
    }
    s.vx *= 0.99;
    s.vy *= 0.99;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    wrap(s);

    if (s.invuln > 0) {
      s.invuln -= dt;
      s.blink += dt * 10;
    }

    // fire
    if (
      keys.includes(" ") &&
      g.step - s.lastFire >= 10 &&
      g.bullets.filter((b) => b.owner === pid).length < 5 &&
      s.invuln <= 0
    ) {
      s.lastFire = g.step;
      const dx = -Math.sin(s.rot);
      const dy = Math.cos(s.rot);
      g.bullets.push({
        x: s.x + dx * 0.7,
        y: s.y + dy * 0.7,
        vx: dx * BULLET_SPEED,
        vy: dy * BULLET_SPEED,
        life: BULLET_LIFE,
        owner: pid,
      });
    }
  }

  // bullets + asteroids with sub-steps (prevents tunneling)
  for (let s = 0; s < 6; s++) {
    for (let i = g.bullets.length - 1; i >= 0; i--) {
      const b = g.bullets[i];
      b.x += (b.vx * dt) / 6;
      b.y += (b.vy * dt) / 6;
      b.life -= dt / 6;
      if (
        b.life <= 0 ||
        Math.abs(b.x) > BOUNDS + 1.5 ||
        Math.abs(b.y) > BOUNDS + 1.5
      ) {
        g.bullets.splice(i, 1);
      }
    }

    for (const a of g.asteroids) {
      a.x += (a.vx * dt) / 6;
      a.y += (a.vy * dt) / 6;
      a.rotX += ((a.vy * dt) / 6) * 0.5;
      a.rotY += ((a.vx * dt) / 6) * 0.5;
      wrap(a);
    }

    for (let i = g.asteroids.length - 1; i >= 0; i--) {
      const a = g.asteroids[i];
      let hit = false;
      for (let j = g.bullets.length - 1; j >= 0; j--) {
        const b = g.bullets[j];
        if (
          bulletHitHull(
            b.x,
            b.y,
            null,
            a.r,
            a.x,
            a.y,
            b.x - (b.vx * dt) / 6,
            b.y - (b.vy * dt) / 6,
            a.x - (a.vx * dt) / 6,
            a.y - (a.vy * dt) / 6,
          )
        ) {
          hitAsteroid(g, a, b.owner);
          g.bullets.splice(j, 1);
          hit = true;
          break;
        }
      }
      if (hit) g.asteroids.splice(i, 1);
    }
  }

  // ship-asteroid
  for (const [pid, s] of Object.entries(g.ships)) {
    if (s.lives <= 0 || s.invuln > 0) continue;
    for (let i = g.asteroids.length - 1; i >= 0; i--) {
      const a = g.asteroids[i];
      const dx = s.x - a.x;
      const dy = s.y - a.y;
      if (dx * dx + dy * dy < (a.r + SHIP_R) * (a.r + SHIP_R)) {
        spawnConfetti(g, s.x, s.y);
        s.lives--;
        if (s.lives <= 0) {
          s.lives = 0;
        }
        s.invuln = 2;
        s.blink = 0;
        s.x = 0;
        s.y = 0;
        s.vx = 0;
        s.vy = 0;
        g.asteroids.splice(i, 1);
        break;
      }
    }
  }

  // ship-planet collision
  for (const [pid, s] of Object.entries(g.ships)) {
    if (s.lives <= 0 || s.invuln > 0 || !p.active) continue;
    const dx = s.x - p.x;
    const dy = s.y - p.y;
    if (dx * dx + dy * dy < (SHIP_R + PLANET_R) * (SHIP_R + PLANET_R)) {
      spawnConfetti(g, s.x, s.y);
      s.lives--;
      if (s.lives <= 0) {
        s.lives = 0;
      }
      s.invuln = 2;
      s.blink = 0;
      s.x = 0;
      s.y = 0;
      s.vx = 0;
      s.vy = 0;
    }
  }

  // particles
  for (let i = g.particles.length - 1; i >= 0; i--) {
    const p = g.particles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    if (p.life <= 0) g.particles.splice(i, 1);
  }

  // level check
  if (g.asteroids.length === 0) {
    g.level++;
    initLevel(g);
  }

  // game over check
  const alive = Object.values(g.ships).filter((s) => s.lives > 0);
  if (alive.length === 0 && Object.keys(g.ships).length > 0) {
    console.log(
      `game over at step ${g.step}, ${Object.keys(g.ships).length} ship(s)`,
    );
    g.running = false;
  }
}

function serializeState(g) {
  const ships = {};
  for (const [pid, s] of Object.entries(g.ships)) {
    ships[pid] = {
      x: +s.x.toFixed(3),
      y: +s.y.toFixed(3),
      vx: +s.vx.toFixed(3),
      vy: +s.vy.toFixed(3),
      rot: +s.rot.toFixed(3),
      score: s.score,
      lives: s.lives,
      invuln: +s.invuln.toFixed(2),
      blink: +s.blink.toFixed(1),
      thrusting: s.thrusting,
    };
  }
  const ast = g.asteroids.map((a) => ({
    id: a.id,
    x: +a.x.toFixed(2),
    y: +a.y.toFixed(2),
    rotX: +a.rotX.toFixed(2),
    rotY: +a.rotY.toFixed(2),
    r: a.r,
    size: a.size,
  }));
  const bul = g.bullets.map((b) => ({
    x: +b.x.toFixed(2),
    y: +b.y.toFixed(2),
    owner: b.owner,
  }));
  const par = g.particles.map((p) => ({
    x: +p.x.toFixed(2),
    y: +p.y.toFixed(2),
    life: +p.life.toFixed(2),
  }));
  const gplanet = g.planet;
  const planet = gplanet.active
    ? { x: +gplanet.x.toFixed(2), y: +gplanet.y.toFixed(2), active: true }
    : { active: false };
  return {
    t: g.step,
    ships,
    asteroids: ast,
    bullets: bul,
    particles: par,
    planet,
    running: g.running,
    level: g.level,
  };
}

module.exports = {
  createGame,
  updateGame,
  serializeState,
  initPlayerShip,
  initLevel,
};
