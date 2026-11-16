// The player: movement with acceleration, friction, gravity, crouch and jump,
// resolved as a box against the world's colliders; plus health and armour.
// Movement shares the body solver in collide.js with the bots.
import * as THREE from 'three';
import { createBody } from './collide.js';

const STAND_EYE = 1.6;
const CROUCH_EYE = 1.02;
const WALK_SPEED = 5.2;
const CROUCH_SPEED = 2.4;
const SNEAK_SPEED = 2.6;

export function createPlayer(colliders, spawn) {
  const body = createBody(colliders, 0.34, 1.72);
  body.pos.copy(spawn);
  const state = {
    yaw: 0,
    pitch: 0,
    eye: STAND_EYE,
    health: 100,
    armour: 0,
    alive: true,
    crouching: false,
  };
  const wish = new THREE.Vector3();

  function look(dx, dy, sensitivity = 0.0022) {
    state.yaw -= dx * sensitivity;
    state.pitch = Math.max(-1.45, Math.min(1.45, state.pitch - dy * sensitivity));
  }

  function recoil(pitchKick, yawKick) {
    state.pitch = Math.min(1.45, state.pitch + pitchKick);
    state.yaw += yawKick;
  }

  // Damage: armour soaks half, rounded down, until it runs out.
  function damage(amount) {
    if (!state.alive) return 0;
    let rest = amount;
    if (state.armour > 0) {
      const soaked = Math.min(state.armour, Math.floor(rest / 2));
      state.armour -= soaked;
      rest -= soaked;
    }
    state.health = Math.max(0, state.health - rest);
    if (state.health === 0) state.alive = false;
    return rest;
  }

  function step(dt, keys) {
    if (!state.alive) return;
    const crouching = keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC');
    state.crouching = crouching;
    const eyeTarget = crouching ? CROUCH_EYE : STAND_EYE;
    state.eye += (eyeTarget - state.eye) * Math.min(1, dt * 12);

    const forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    wish.set(0, 0, 0);
    if (forward || strafe) {
      const sin = Math.sin(state.yaw);
      const cos = Math.cos(state.yaw);
      wish.set(-sin * forward + cos * strafe, 0, -cos * forward - sin * strafe).normalize();
    }
    const sneaking = keys.has('ShiftLeft') || keys.has('ShiftRight');
    const speed = crouching ? CROUCH_SPEED : sneaking ? SNEAK_SPEED : WALK_SPEED;
    body.step(dt, wish, speed, { crouch: crouching, jump: keys.has('Space') });
  }

  function reset(spawnPoint) {
    body.pos.copy(spawnPoint);
    body.vel.set(0, 0, 0);
    state.yaw = 0;
    state.pitch = 0;
    state.eye = STAND_EYE;
    state.health = 100;
    // Armour is bought, not issued: it carries over to the next round.
    state.alive = true;
    state.crouching = false;
  }

  return {
    state,
    body,
    step,
    look,
    recoil,
    damage,
    reset,
    groundSpeed() {
      return body.groundSpeed();
    },
    eyePosition(out) {
      out.set(body.pos.x, body.pos.y + state.eye, body.pos.z);
      return out;
    },
  };
}
