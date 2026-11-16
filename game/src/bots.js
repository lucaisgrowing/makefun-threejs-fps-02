// The bots: seven of them — two allies push with you, five defenders hold the sites.
// Each bot has a role, a waypoint path, eyes that check line of sight, a reaction
// time, and burst fire with real aim error. They plant, defuse, rotate and retreat.
import * as THREE from 'three';
import { createBody, hasLineOfSight } from './collide.js';
import { PALETTE } from './palette.js';
import { WEAPONS } from './weapon.js';

const NAMES_ATTACK = ['Rook', 'Vex'];
const NAMES_DEFEND = ['Ash', 'Bramble', 'Flint', 'Heron', 'Juno'];
const EYE = 1.5;

function buildMesh(team) {
  const color = team === 'attack' ? PALETTE.team : PALETTE.enemy;
  const bodyMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.7, metalness: 0.1 });
  const darkMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.85 });
  const headMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.6 });
  const group = new THREE.Group();
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.8, 0.32), bodyMat);
  torso.position.y = 1.0;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 10), headMat);
  head.position.y = 1.55;
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.7, 0.2), darkMat);
  legL.position.set(-0.14, 0.35, 0);
  const legR = legL.clone();
  legR.position.x = 0.14;
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.09, 0.52), darkMat);
  gun.position.set(0.2, 1.18, -0.28);
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.22, 0.22),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.2, 1.18, -0.62);
  flash.visible = false;
  group.add(torso, head, legL, legR, gun, flash);
  group.traverse((m) => {
    if (m.isMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });
  return { group, flash };
}

export function createBots(scene, world, rng) {
  const nav = world.nav;
  const bots = [];
  const eye = new THREE.Vector3();
  const targetPos = new THREE.Vector3();
  const wish = new THREE.Vector3();
  let simNow = 0;

  function spawnBot(team, name, index) {
    const isAttack = team === 'attack';
    const spawn = world.spawns[isAttack ? 'attack' : 'defend'][index % 3];
    const body = createBody(world.colliders, 0.34, 1.72);
    body.pos.set(spawn.x + (rng() - 0.5), 0, spawn.z + (rng() - 0.5));
    const { group, flash } = buildMesh(team);
    group.position.copy(body.pos);
    scene.add(group);
    const bot = {
      id: `${team}-${name}`,
      name,
      team,
      spawnIndex: index % 3,
      body,
      group,
      flash,
      yaw: isAttack ? 0 : Math.PI,
      pitch: 0,
      health: 100,
      alive: true,
      skill: 0.62 + rng() * 0.2 + (isAttack ? 0.06 : 0),
      weapon: rng() < 0.7 ? 'rifle' : 'smg',
      mag: 30,
      cooldown: 0,
      reloadLeft: 0,
      burstLeft: 0,
      burstPause: 0,
      state: 'move',
      path: [],
      pathIndex: 0,
      holdNode: -1,
      site: isAttack ? (rng() < 0.5 ? 'A' : 'B') : null,
      target: null,
      lastSeen: new THREE.Vector3(),
      lastSeenAt: -99,
      reactAt: 0,
      scanAt: rng() * 0.15,
      fall: 0,
      carrier: false,
      plant: 0,
      defuse: 0,
      blindUntil: 0,
      investigate: null,
      flashAt: 0,
      lastHurtAt: -99,
      lastAttacker: null,
      walkPhase: rng() * 6,
    };
    bot.headY = 1.55;
    bot.bodyY = 1.0;
    bot.pos = body.pos;
    return bot;
  }

  for (let i = 0; i < NAMES_ATTACK.length; i += 1) bots.push(spawnBot('attack', NAMES_ATTACK[i], i + 1));
  for (let i = 0; i < NAMES_DEFEND.length; i += 1) bots.push(spawnBot('defend', NAMES_DEFEND[i], i));

  function reset(round) {
    for (const bot of bots) {
      const isAttack = bot.team === 'attack';
      const spawn = world.spawns[isAttack ? 'attack' : 'defend'][bot.spawnIndex];
      bot.body.pos.set(spawn.x + (rng() - 0.5), 0, spawn.z + (rng() - 0.5));
      bot.body.vel.set(0, 0, 0);
      bot.yaw = isAttack ? 0 : Math.PI;
      bot.pitch = 0;
      bot.health = 100;
      bot.alive = true;
      bot.mag = 30;
      bot.cooldown = 0;
      bot.reloadLeft = 0;
      bot.burstLeft = 0;
      bot.burstPause = 0;
      bot.target = null;
      bot.lastSeenAt = -99;
      bot.fall = 0;
      bot.carrier = false;
      bot.plant = 0;
      bot.defuse = 0;
      bot.blindUntil = 0;
      bot.investigate = null;
      bot.flashAt = 0;
      bot.group.rotation.set(0, bot.yaw, 0);
      bot.group.position.copy(bot.body.pos);
      bot.group.visible = true;
      bot.site = isAttack ? (rng() < 0.5 ? 'A' : 'B') : null;
      bot.state = 'move';
      if (!isAttack) {
        const holds = [nav.holdA, nav.holdB, nav.holdMid][bots.indexOf(bot) % 3];
        bot.holdNode = holds[Math.floor(rng() * holds.length)];
        bot.path = nav.findPath(nav.nearestNode(bot.body.pos.x, bot.body.pos.z), bot.holdNode);
        bot.pathIndex = 0;
      } else {
        bot.path = [];
        bot.pathIndex = 0;
      }
    }
  }

  function repath(bot, toNode) {
    const from = nav.nearestNode(bot.body.pos.x, bot.body.pos.z);
    bot.path = nav.findPath(from, toNode);
    bot.pathIndex = 0;
  }

  function aimAt(bot, point, error) {
    const dx = point.x - bot.body.pos.x;
    const dy = point.y - (bot.body.pos.y + EYE);
    const dz = point.z - bot.body.pos.z;
    const len = Math.hypot(dx, dy, dz) || 1;
    const yaw = Math.atan2(-dx, -dz);
    const pitch = Math.asin(Math.max(-1, Math.min(1, dy / len)));
    bot.yaw = yaw + (rng() * 2 - 1) * error;
    bot.pitch = pitch + (rng() * 2 - 1) * error;
  }

  function scan(bot, time, actors) {
    eye.set(bot.body.pos.x, bot.body.pos.y + EYE, bot.body.pos.z);
    let best = null;
    let bestD = 42;
    for (const actor of actors) {
      if (!actor.alive || actor.team === bot.team) continue;
      targetPos.set(actor.pos.x, actor.pos.y + 1.1, actor.pos.z);
      const d = eye.distanceTo(targetPos);
      if (d > bestD) continue;
      // Only notice what is roughly in front of them.
      const dx = targetPos.x - eye.x;
      const dz = targetPos.z - eye.z;
      const facing = Math.atan2(-Math.sin(bot.yaw), -Math.cos(bot.yaw));
      const toTarget = Math.atan2(dx, dz);
      let diff = Math.abs(toTarget - facing);
      if (diff > Math.PI) diff = Math.PI * 2 - diff;
      if (d > 6 && diff > 1.15) continue;
      if (!hasLineOfSight(world.colliders, eye, targetPos)) continue;
      best = actor;
      bestD = d;
    }
    if (best) {
      if (bot.target !== best) bot.reactAt = time + 0.25 + (1 - bot.skill) * 0.35 + rng() * 0.15;
      bot.target = best;
      bot.lastSeen.copy(best.pos);
      bot.lastSeenAt = time;
    } else if (bot.target && time - bot.lastSeenAt > 1.2) {
      bot.target = null;
    }
  }

  function shoot(bot, time, ctx) {
    const def = WEAPONS[bot.weapon];
    if (bot.cooldown > 0 || bot.reloadLeft > 0 || bot.mag <= 0) return;
    if (bot.burstLeft <= 0) {
      if (bot.burstPause > 0) return;
      bot.burstLeft = 3 + Math.floor(rng() * 4);
    }
    bot.mag -= 1;
    bot.burstLeft -= 1;
    bot.cooldown = def.gap;
    if (bot.burstLeft === 0) bot.burstPause = 0.5 + rng() * 0.4;
    if (bot.mag === 0) bot.reloadLeft = def.reload;
    const target = bot.target;
    const dist = target ? Math.hypot(target.pos.x - bot.body.pos.x, target.pos.z - bot.body.pos.z) : 10;
    const speed = target ? Math.hypot(target.vel?.x ?? 0, target.vel?.z ?? 0) : 0;
    const error = (0.02 + dist * 0.0011 + speed * 0.004) * (1.25 - bot.skill * 0.55);
    const aimPoint = new THREE.Vector3(target.pos.x, target.pos.y + (rng() < 0.22 ? 1.55 : 1.05), target.pos.z);
    aimAt(bot, aimPoint, error);
    const dir = new THREE.Vector3(-Math.sin(bot.yaw) * Math.cos(bot.pitch), Math.sin(bot.pitch), -Math.cos(bot.yaw) * Math.cos(bot.pitch));
    eye.set(bot.body.pos.x, bot.body.pos.y + EYE, bot.body.pos.z);
    ctx.onShoot(bot, eye, dir, def);
    bot.flash.visible = true;
    bot.flashAt = time;
  }

  function stepBot(bot, dt, time, ctx) {
    const { actors, bomb, spike } = ctx;
    if (!bot.alive) {
      bot.fall = Math.min(1, bot.fall + dt / 0.4);
      bot.group.rotation.x = -bot.fall * 1.45;
      return;
    }
    bot.cooldown = Math.max(0, bot.cooldown - dt);
    bot.burstPause = Math.max(0, bot.burstPause - dt);
    if (bot.reloadLeft > 0) {
      bot.reloadLeft = Math.max(0, bot.reloadLeft - dt);
      if (bot.reloadLeft === 0) bot.mag = WEAPONS[bot.weapon].mag;
    }
    if (bot.flashAt && time - bot.flashAt > 0.05) {
      bot.flash.visible = false;
      bot.flashAt = 0;
    }
    const blind = time < bot.blindUntil;
    if (time >= bot.scanAt) {
      bot.scanAt = time + 0.12;
      if (!blind) scan(bot, time, actors);
    }

    const target = bot.target;
    const engaging = !!target && time >= bot.reactAt && !blind;
    wish.set(0, 0, 0);
    let speed = 0;

    if (bot.team === 'attack') {
      if (bomb.state === 'planted') {
        // Guard the planted spike: hold near its site.
        const site = world.sites[bomb.site];
        const d = Math.hypot(bot.body.pos.x - site.center.x, bot.body.pos.z - site.center.z);
        if (d > 5 && !engaging && !bot.path.length) {
          repath(bot, nav.nearestNode(site.center.x, site.center.z));
          bot.state = 'move';
        } else if (d <= 5) bot.state = 'hold';
      } else if (bot.carrier) {
        const site = world.sites[bot.site];
        const d = Math.hypot(bot.body.pos.x - site.center.x, bot.body.pos.z - site.center.z);
        if (d < site.radius && !engaging) {
          bot.state = 'plant';
          bot.plant += dt;
          if (bot.plant >= 3.5) ctx.plantBomb(bot);
        } else {
          bot.plant = 0;
          if (!bot.path.length) repath(bot, nav.nearestNode(site.center.x, site.center.z));
          bot.state = 'move';
        }
      } else if (spike.dropped && !spike.carrier) {
        const d = Math.hypot(bot.body.pos.x - spike.pos.x, bot.body.pos.z - spike.pos.z);
        if (d < 1.2) {
          spike.carrier = bot;
          bot.carrier = true;
          ctx.onEvent('pickup', bot);
        } else if (!bot.path.length) {
          repath(bot, nav.nearestNode(spike.pos.x, spike.pos.z));
          bot.state = 'move';
        }
      } else if (!bot.path.length && !engaging) {
        const site = world.sites[bot.site];
        repath(bot, nav.nearestNode(site.center.x, site.center.z));
        bot.state = 'move';
      }
    } else {
      // Defenders.
      if (bomb.state === 'planted') {
        const site = world.sites[bomb.site];
        const d = Math.hypot(bot.body.pos.x - bomb.pos.x, bot.body.pos.z - bomb.pos.z);
        if (d < 1.4 && !engaging) {
          bot.state = 'defuse';
          if (simNow - bot.lastHurtAt > 1) bot.defuse += dt;
          if (bot.defuse >= 5) ctx.defuseBomb(bot);
        } else {
          bot.defuse = 0;
          if (!engaging && !bot.path.length) {
            repath(bot, nav.nearestNode(bomb.pos.x, bomb.pos.z));
          }
          bot.state = 'move';
        }
      } else if (bot.health < 35 && target) {
        if (!bot.path.length) {
          const holds = bot.holdNode >= 0 ? [bot.holdNode] : nav.holdMid;
          repath(bot, holds[Math.floor(rng() * holds.length)]);
        }
        bot.state = 'move';
      } else if (bot.investigate && !engaging) {
        const d = Math.hypot(bot.body.pos.x - bot.investigate.x, bot.body.pos.z - bot.investigate.z);
        if (d < 1.5) bot.investigate = null;
        else if (!bot.path.length) repath(bot, nav.nearestNode(bot.investigate.x, bot.investigate.z));
        bot.state = 'move';
      } else if (bot.state === 'move' && bot.path.length) {
        // walking to the hold node; arrival handled below
      } else {
        bot.state = 'hold';
      }
    }

    if (bot.state === 'move' && bot.path.length) {
      const node = nav.nodes[bot.path[bot.pathIndex]];
      const dx = node[0] - bot.body.pos.x;
      const dz = node[1] - bot.body.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.7) {
        bot.pathIndex += 1;
        if (bot.pathIndex >= bot.path.length) {
          bot.path = [];
          bot.state = bot.team === 'defend' ? 'hold' : 'move';
        }
      } else {
        wish.set(dx / d, 0, dz / d);
        speed = (bomb.state === 'planted' && bot.team === 'defend' ? 4.6 : 3.8) * (0.9 + bot.skill * 0.2);
        if (!engaging) {
          const targetYaw = Math.atan2(-dx, -dz);
          let diff = targetYaw - bot.yaw;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          bot.yaw += diff * Math.min(1, dt * 6);
        }
      }
    }

    if (engaging) {
      const aimPoint = new THREE.Vector3(target.pos.x, target.pos.y + 1.1, target.pos.z);
      const dx = aimPoint.x - bot.body.pos.x;
      const dz = aimPoint.z - bot.body.pos.z;
      const targetYaw = Math.atan2(-dx, -dz);
      let diff = targetYaw - bot.yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      bot.yaw += diff * Math.min(1, dt * 10);
      shoot(bot, time, ctx);
      // Strafe a little while fighting so they are not standing targets.
      bot.walkPhase += dt * 2;
      wish.set(Math.cos(bot.walkPhase) * 0.3, 0, 0);
      speed = 1.1;
    }

    bot.body.step(dt, wish, speed, { crouch: false, jump: false });
    bot.group.position.copy(bot.body.pos);
    bot.group.rotation.set(0, bot.yaw, 0);
    if (bot.state === 'plant' || bot.state === 'defuse') {
      bot.group.rotation.y = bot.yaw;
    }
  }

  return {
    bots,
    reset,
    step(dt, time, ctx) {
      simNow = time;
      for (const bot of bots) stepBot(bot, dt, time, ctx);
    },
    aliveCount(team) {
      return bots.filter((b) => b.team === team && b.alive).length;
    },
    damage(bot, amount, part, from) {
      if (!bot.alive) return;
      bot.health -= amount;
      bot.lastHurtAt = simNow;
      bot.lastAttacker = from;
      bot.plant = 0;
      if (bot.health <= 0) {
        bot.health = 0;
        bot.alive = false;
        bot.group.visible = true;
        if (bot.carrier) {
          bot.carrier = false;
        }
      }
    },
    alert(pos) {
      for (const bot of bots) {
        if (!bot.alive || bot.team !== 'defend' || bot.target) continue;
        const d = Math.hypot(bot.body.pos.x - pos.x, bot.body.pos.z - pos.z);
        if (d < 18) bot.investigate = { x: pos.x, z: pos.z };
      }
    },
    blindAllies(pos, radius) {
      for (const bot of bots) {
        if (!bot.alive) continue;
        const d = Math.hypot(bot.body.pos.x - pos.x, bot.body.pos.z - pos.z);
        if (d < radius) bot.blindUntil = simNow + 2.5;
      }
    },
  };
}
