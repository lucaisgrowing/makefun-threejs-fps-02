// Shared AABB movement: one axis at a time, so a wall never swallows a body.
// The player and every bot move through this, with the same rules.
import * as THREE from 'three';

export function createBody(colliders, radius, height) {
  const probe = new THREE.Box3();
  const pos = new THREE.Vector3();
  const vel = new THREE.Vector3();
  let onGround = false;

  function overlaps(x, y, z, h, lift) {
    probe.min.set(x - radius, y + lift, z - radius);
    probe.max.set(x + radius, y + h - lift, z + radius);
    for (const c of colliders) if (probe.intersectsBox(c)) return c;
    return null;
  }

  // Move a standing body. `wish` is a horizontal unit vector (or zero), `speed` its
  // target speed; gravity and jumping are handled here. Returns nothing; pos/vel are
  // mutated in place. `crouch` shrinks the body height for this step.
  function step(dt, wish, speed, opts) {
    const crouch = !!opts.crouch;
    const h = crouch ? height * 0.65 : height;
    const accel = onGround ? 42 : 9;
    const blend = Math.min(1, (accel * dt) / Math.max(speed, 0.01));
    vel.x += (wish.x * speed - vel.x) * blend;
    vel.z += (wish.z * speed - vel.z) * blend;
    if (onGround && !wish.lengthSq()) {
      const damp = Math.max(0, 1 - 9 * dt);
      vel.x *= damp;
      vel.z *= damp;
    }
    if (opts.jump && onGround) {
      vel.y = 6.2;
      onGround = false;
    }
    vel.y -= 20 * dt;
    const nx = pos.x + vel.x * dt;
    if (!overlaps(nx, pos.y, pos.z, h, 0.04)) pos.x = nx;
    else vel.x = 0;
    const nz = pos.z + vel.z * dt;
    if (!overlaps(pos.x, pos.y, nz, h, 0.04)) pos.z = nz;
    else vel.z = 0;
    pos.y += vel.y * dt;
    onGround = false;
    const hit = overlaps(pos.x, pos.y, pos.z, h, 0);
    if (hit && vel.y <= 0) {
      pos.y = hit.max.y;
      vel.y = 0;
      onGround = true;
    } else if (hit) {
      pos.y = hit.min.y - h;
      vel.y = 0;
    }
    if (pos.y < 0) {
      pos.y = 0;
      vel.y = 0;
      onGround = true;
    }
    vel.y = Math.max(-30, vel.y);
  }

  return {
    pos,
    vel,
    height,
    get onGround() {
      return onGround;
    },
    step,
    groundSpeed() {
      return Math.hypot(vel.x, vel.z);
    },
  };
}

// A straight line of sight between two points, blocked by any world box.
// Sampled in small steps; cheap enough to run a few times per bot per second.
export function hasLineOfSight(colliders, from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  const dist = Math.hypot(dx, dy, dz);
  const steps = Math.max(1, Math.ceil(dist / 0.35));
  const p = new THREE.Vector3();
  for (let i = 1; i < steps; i += 1) {
    const t = i / steps;
    p.set(from.x + dx * t, from.y + dy * t, from.z + dz * t);
    for (const c of colliders) {
      if (c.containsPoint(p)) return false;
    }
  }
  return true;
}
