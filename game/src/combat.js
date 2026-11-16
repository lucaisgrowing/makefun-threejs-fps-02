// Hitscan combat, shared by the player and the bots: one ray, the nearest thing it
// meets — a head sphere, a body sphere, or a world box. Damage falls off with range;
// headshots multiply. Grenades are the only projectile: a short arc, then a blast.
import * as THREE from 'three';
import { hasLineOfSight } from './collide.js';

const raycaster = new THREE.Raycaster();
const origin = new THREE.Vector3();
const dir = new THREE.Vector3();
const toHit = new THREE.Vector3();

function raySphere(o, d, center, radius) {
  toHit.copy(center).sub(o);
  const tca = toHit.dot(d);
  if (tca < 0) return Infinity;
  const d2 = toHit.lengthSq() - tca * tca;
  const r2 = radius * radius;
  if (d2 > r2) return Infinity;
  return tca - Math.sqrt(r2 - d2);
}

function falloff(damage, dist, range) {
  if (dist <= range * 0.5) return damage;
  if (dist >= range) return Math.round(damage * 0.4);
  const t = (dist - range * 0.5) / (range * 0.5);
  return Math.round(damage * (1 - 0.6 * t));
}

// Actors are { team, alive, pos, headY, bodyY, damage(amount, part, from) }.
// Shoots from `from` along `direction` (unit). Returns the hit, or null with the
// point the bullet stopped at (a wall, or max range).
export function resolveShot(from, direction, def, shooter, actors, shootables) {
  origin.copy(from);
  dir.copy(direction);
  raycaster.set(origin, dir);
  raycaster.far = def.range * 1.6;
  const wall = raycaster.intersectObjects(shootables, false)[0];
  const wallDist = wall ? wall.distance : def.range * 1.6;
  let best = null;
  let bestDist = wallDist;
  for (const actor of actors) {
    if (!actor.alive || actor === shooter) continue;
    const head = new THREE.Vector3(actor.pos.x, actor.pos.y + actor.headY, actor.pos.z);
    const body = new THREE.Vector3(actor.pos.x, actor.pos.y + actor.bodyY, actor.pos.z);
    const th = raySphere(origin, dir, head, 0.17);
    if (th < bestDist) {
      bestDist = th;
      best = { actor, part: 'head', point: origin.clone().addScaledVector(dir, th) };
    }
    const tb = raySphere(origin, dir, body, 0.42);
    if (tb < bestDist) {
      bestDist = tb;
      best = { actor, part: 'body', point: origin.clone().addScaledVector(dir, tb) };
    }
  }
  if (!best) {
    const point = origin.clone().addScaledVector(dir, Math.min(wallDist, def.range * 1.6));
    return { hit: null, point, wall: !!wall };
  }
  const damage = falloff(def.damage, bestDist, def.range) * (best.part === 'head' ? def.headMult : 1);
  best.actor.damage(damage, best.part, shooter);
  return { hit: best, point: best.point, damage, wall: false };
}

export function createGrenade(start, direction, kind) {
  return {
    kind,
    pos: start.clone(),
    vel: direction.clone().multiplyScalar(11).add(new THREE.Vector3(0, 3.4, 0)),
    fuse: kind === 'he' ? 1.4 : 1.1,
    alive: true,
    bounced: false,
  };
}

// A grenade arcs under gravity, bounces once off the floor, then goes off.
// Returns 'boom' | 'flash' | null. `hurt` applies damage to actors in the blast.
export function stepGrenade(g, dt, colliders, actors, hurt) {
  if (!g.alive) return null;
  g.fuse -= dt;
  g.vel.y -= 14 * dt;
  g.pos.addScaledVector(g.vel, dt);
  if (g.pos.y < 0.08) {
    g.pos.y = 0.08;
    if (!g.bounced) {
      g.vel.y *= -0.45;
      g.vel.x *= 0.6;
      g.vel.z *= 0.6;
      g.bounced = true;
    } else {
      g.vel.set(0, 0, 0);
    }
  }
  if (g.fuse > 0) return null;
  g.alive = false;
  if (g.kind === 'he') {
    for (const actor of actors) {
      if (!actor.alive) continue;
      const d = Math.hypot(actor.pos.x - g.pos.x, actor.pos.y + 1 - g.pos.y, actor.pos.z - g.pos.z);
      if (d > 6) continue;
      const from = new THREE.Vector3(g.pos.x, g.pos.y + 0.2, g.pos.z);
      const to = new THREE.Vector3(actor.pos.x, actor.pos.y + 1.1, actor.pos.z);
      if (!hasLineOfSight(colliders, from, to)) continue;
      actor.damage(Math.round(110 * (1 - d / 7.5)), 'blast', null);
    }
    hurt(g.pos);
    return 'boom';
  }
  hurt(g.pos, true);
  return 'flash';
}
