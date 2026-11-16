// Boot and the one loop: a fixed 60 Hz simulation feeding a render at the display's rate.
// Sable Line — a round-based tactical FPS: you and two allies plant the spike on
// Site A or B against five Wardens who hold, rotate and defuse.
// ?shot=start|play|end with &seed=N sets up a deterministic frame for a capture, renders it
// twice, then freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createWorld } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createWeapons, WEAPONS, GRENADES } from './weapon.js';
import { createBots } from './bots.js';
import { createRounds, ROUND_SECONDS } from './rounds.js';
import { createAudio } from './audio.js';
import { createFx } from './fx.js';
import { createHud } from './hud.js';
import { resolveShot, createGrenade, stepGrenade } from './combat.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = mulberry32(seed);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.sky);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.sky), 26, 70);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

const world = createWorld(scene);
const rounds = createRounds(world);
const audio = createAudio();
const fx = createFx(scene);
const hud = createHud();
const player = createPlayer(world.colliders, world.spawns.attack[0]);
const weapons = createWeapons(camera);
const bots = createBots(scene, world, random);
const input = createInput(renderer.domElement, onLockChange);
const shootables = world.shootables;

const body = player.state;
let elapsed = 0;
let phase = rounds.state.phase;
let frozen = false;
let started = false;
let accumulator = 0;
let lastTime = performance.now();
let stepTimer = 0;
let spectate = null;
const grenades = [];
const eyePos = new THREE.Vector3();
const dirVec = new THREE.Vector3();
const camDir = new THREE.Vector3();
let buyOpen = false;

// ---- actors: the one damage interface combat.js shoots at ----
const playerActor = {
  team: 'attack',
  name: 'You',
  get alive() {
    return player.state.alive;
  },
  pos: player.body.pos,
  vel: player.body.vel,
  headY: 1.6,
  bodyY: 1.0,
  damage(amount, part, from) {
    // Staged captures are not a real round: the player cannot die mid-shot.
    if (shot) return;
    const dealt = player.damage(amount);
    if (dealt <= 0) return;
    hud.damageFlash();
    audio.hurt();
    if (!player.state.alive) onPlayerDeath(from, part);
  },
};
const botActors = bots.bots.map((bot) => ({
  team: bot.team,
  name: bot.name,
  get alive() {
    return bot.alive;
  },
  pos: bot.body.pos,
  vel: bot.body.vel,
  headY: 1.55,
  bodyY: 1.0,
  damage(amount, part, from) {
    const wasAlive = bot.alive;
    bots.damage(bot, amount, part, from);
    if (wasAlive && !bot.alive) onBotDeath(bot, from, part);
  },
}));
const actors = [playerActor, ...botActors];

function teamName(actor) {
  if (actor === playerActor) return 'You';
  return actor.name;
}
function teamClass(actor) {
  return actor.team === 'attack' ? 't' : 'e';
}

function onBotDeath(bot, from, part) {
  const killer = from === playerActor ? 'You' : from ? teamName(from) : 'Sable';
  const head = part === 'head' ? ' <span style="color:var(--accent)">HEADSHOT</span>' : '';
  hud.killfeed(`<b class="${teamClass(from ?? playerActor)}">${killer}</b> ▸ <b class="e">${bot.name}</b>${head}`);
  if (bot.team === 'defend') {
    rounds.onKill(from ? from.team : 'attack');
    if (from === playerActor) {
      audio.hit(true);
      hud.hitMarker(true, 400);
    }
  }
  if (bot.carrier) {
    rounds.dropSpike(bot.body.pos);
    fx.showSpike(bot.body.pos);
    hud.setHint('Spike dropped — recover it');
  }
}

function onPlayerDeath(from, part) {
  rounds.onDeath();
  const killer = from ? teamName(from) : 'Warden';
  hud.killfeed(`<b class="e">${killer}</b> ▸ <b class="t">You</b>${part === 'head' ? ' <span style="color:var(--accent)">HEADSHOT</span>' : ''}`);
  if (rounds.state.spike.carrier === 'player') {
    rounds.dropSpike(player.body.pos);
    fx.showSpike(player.body.pos);
    hud.setHint('Spike dropped — an ally can recover it');
  }
  if (document.pointerLockElement) document.exitPointerLock();
  hud.showOverlay('dead');
}

function aliveCounts() {
  return {
    attack: (player.state.alive ? 1 : 0) + bots.aliveCount('attack'),
    defend: bots.aliveCount('defend'),
  };
}

function syncCamera() {
  if (!player.state.alive && spectate) {
    camera.position.set(spectate.body.pos.x, spectate.body.pos.y + 1.55, spectate.body.pos.z);
    camera.rotation.set(spectate.pitch, spectate.yaw, 0, 'YXZ');
    return;
  }
  camera.position.set(player.body.pos.x, player.body.pos.y + body.eye, player.body.pos.z);
  camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
}

function shootPlayer(spread) {
  if (!weapons.pullTrigger()) return false;
  camera.getWorldDirection(camDir);
  dirVec.copy(camDir);
  dirVec.x += (random() * 2 - 1) * spread;
  dirVec.y += (random() * 2 - 1) * spread;
  dirVec.z += (random() * 2 - 1) * spread;
  dirVec.normalize();
  player.eyePosition(eyePos);
  const result = resolveShot(eyePos, dirVec, weapons.currentDef(), playerActor, actors, shootables);
  fx.tracer(eyePos, result.point);
  if (result.hit) {
    hud.hitMarker(false);
    audio.hit(false);
  } else if (result.wall) {
    fx.impact(result.point);
  }
  audio.shot(false);
  player.recoil(0.009 + random() * 0.004, (random() * 2 - 1) * 0.004);
  bots.alert(eyePos);
  return true;
}

function shootBot(bot, from, dir, def) {
  const result = resolveShot(from, dir, def, botActors.find((a) => a.name === bot.name), actors, shootables);
  fx.tracer(from, result.point);
  if (result.hit) {
    if (result.hit.actor === playerActor) audio.shot(true);
  } else if (result.wall) {
    fx.impact(result.point);
  } else {
    audio.shot(true);
  }
}

function throwGrenade(kind) {
  if (!weapons.takeGrenade(kind)) return;
  player.eyePosition(eyePos);
  camera.getWorldDirection(camDir);
  grenades.push(createGrenade(eyePos, camDir, kind));
  audio.step();
}

function buy(id) {
  if (rounds.state.phase !== 'buy') {
    hud.setHint('Buy phase is over — fight with what you have');
    audio.denied();
    return;
  }
  if (id === 'armour') {
    if (player.state.armour >= 50) {
      audio.denied();
      return;
    }
    if (!rounds.buyArmour()) {
      audio.denied();
      return;
    }
    player.state.armour = 50;
    audio.buy();
    refreshBuyMenu();
    return;
  }
  if (WEAPONS[id]) {
    if (weapons.owned(id)) {
      weapons.switchTo(id);
      refreshBuyMenu();
      return;
    }
    if (!rounds.buy(id)) {
      audio.denied();
      return;
    }
    weapons.buy(id);
    weapons.switchTo(id);
    audio.buy();
    refreshBuyMenu();
    return;
  }
  if (GRENADES[id]) {
    if (!rounds.buy(id)) {
      audio.denied();
      return;
    }
    weapons.buyGrenade(id);
    audio.buy();
    refreshBuyMenu();
  }
}

function refreshBuyMenu() {
  buyOpen = true;
  hud.showBuy(
    rounds.state.round,
    rounds.state.money,
    { rifle: weapons.owned('rifle'), smg: weapons.owned('smg') },
    { he: weapons.state.grenades.he, flash: weapons.state.grenades.flash },
    player.state.armour >= 50,
  );
}

function resetMatch() {
  rounds.state.scoreAttack = 0;
  rounds.state.scoreDefend = 0;
  rounds.state.round = 1;
  rounds.state.money = 800;
  rounds.state.lossStreak = 0;
  rounds.state.kills = 0;
  rounds.state.deaths = 0;
  rounds.state.matchWinner = null;
  player.state.armour = 0;
  weapons.state.owned = { pistol: true };
  weapons.switchTo('pistol');
  weapons.refill();
  startRound();
}

function startRound() {
  player.reset(world.spawns.attack[0]);
  bots.reset();
  fx.hideSpike();
  grenades.length = 0;
  spectate = null;
  rounds.startBuy();
  hud.setHint('Buy phase — B for the buy menu');
  refreshBuyMenu();
}

function onPhaseChange(next) {
  if (next === 'buy') {
    startRound();
  } else if (next === 'live') {
    buyOpen = false;
    hud.hideBuy();
    hud.banner(`Round ${rounds.state.round}`, 'Plant the spike at A or B — or wipe the Wardens out');
    hud.setHint('E plants the spike inside a site · B buy menu (buy phase only)');
  } else if (next === 'end') {
    const b = rounds.state.banner;
    const won = b.winner === 'attack';
    hud.banner(won ? 'Round won' : 'Round lost', b.reason, 3400);
    if (won) audio.roundWin();
    else audio.roundLose();
    buyOpen = false;
    hud.hideBuy();
  } else if (next === 'match') {
    const won = rounds.state.matchWinner === 'attack';
    hud.showOverlay('match', won ? `Sable takes the match ${rounds.state.scoreAttack}–${rounds.state.scoreDefend}. The foundry is yours.` : `Wardens take the match ${rounds.state.scoreDefend}–${rounds.state.scoreAttack}. Buy better guns and run it back.`);
    if (document.pointerLockElement) document.exitPointerLock();
  }
}

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    started = true;
    audio.unlock();
    hud.hideOverlay();
  } else if (player.state.alive && rounds.state.phase === 'live' && !rounds.state.matchWinner) {
    hud.showOverlay('paused');
  }
}

hud.onPlay(() => {
  if (shot) return;
  audio.unlock();
  if (rounds.state.phase === 'match') {
    resetMatch();
    hud.hideOverlay();
    input.requestLock();
    return;
  }
  if (!player.state.alive) {
    hud.hideOverlay();
    return;
  }
  input.requestLock();
});
hud.onBuy(buy);

function step(dt) {
  elapsed += dt;
  const prevPhase = rounds.state.phase;
  rounds.step(dt, aliveCounts());
  if (rounds.state.phase !== prevPhase) onPhaseChange(rounds.state.phase);
  phase = rounds.state.phase;

  // Player movement and look are sim, not render.
  player.step(dt, input.state.keys);
  weapons.step(dt);
  const speed = player.groundSpeed();
  if (speed > 0.5 && player.body.onGround) {
    stepTimer += dt;
    if (stepTimer > (input.state.keys.has('ShiftLeft') ? 0.55 : 0.36)) {
      stepTimer = 0;
      audio.step();
    }
  }

  // Bots.
  const ctx = {
    time: elapsed,
    actors,
    bomb: rounds.state.bomb,
    spike: rounds.state.spike,
    onShoot: shootBot,
    onEvent(kind, bot) {
      if (kind === 'pickup') hud.setHint(`${bot.name} recovered the spike`);
    },
    plantBomb(bot) {
      if (rounds.state.bomb.state !== 'carried') return;
      const site = bot.site;
      rounds.state.bomb = { state: 'planted', site, pos: bot.body.pos.clone(), left: 40, plant: 0 };
      hud.banner('Spike planted', `Wardens are rotating to Site ${site}`, 3000);
      audio.plantStart();
    },
    defuseBomb() {
      if (rounds.state.bomb.state !== 'planted') return;
      rounds.state.bomb.state = 'defused';
      rounds.endRound('defend', 'Spike defused');
    },
  };
  bots.step(dt, elapsed, ctx);

  // Player plant / defuse channels.
  const site = rounds.siteAt(player.body.pos);
  const carrying = rounds.state.spike.carrier === 'player';
  if (phase === 'live' && rounds.state.bomb.state === 'carried' && carrying) {
    const holding = input.state.keys.has('KeyE');
    const frac = rounds.tryPlant(player, site, holding, dt, (s) => {
      hud.banner('Spike planted', `Hold Site ${s} until it blows`, 3000);
      audio.plantStart();
    });
    hud.channel(holding && site ? 'Planting spike…' : null, holding && site ? frac : null);
  } else if (phase === 'live' && rounds.state.bomb.state === 'planted') {
    const holding = input.state.keys.has('KeyE');
    const frac = rounds.tryDefuse(player, holding, dt, () => {
      rounds.endRound('defend', 'Spike defused');
    });
    hud.channel(holding ? 'Defusing…' : null, holding ? frac : null);
    if (holding) audio.defuseBeep();
  } else {
    hud.channel(null, null);
  }

  // Spike pickup by the player.
  if (rounds.state.spike.dropped && player.state.alive) {
    const d = Math.hypot(player.body.pos.x - rounds.state.spike.pos.x, player.body.pos.z - rounds.state.spike.pos.z);
    if (d < 1.3) {
      rounds.state.spike = { carrier: 'player', dropped: false, pos: null };
      fx.hideSpike();
      hud.setHint('Spike recovered — plant it at A or B');
    }
  }

  // Grenades in flight.
  for (const g of grenades) {
    if (!g.alive) continue;
    const outcome = stepGrenade(g, dt, world.colliders, actors, (pos, isFlash) => {
      if (isFlash) {
        // Flashed the player? Only if they are looking at it.
        camera.getWorldDirection(camDir);
        const to = new THREE.Vector3(pos.x - camera.position.x, pos.y - camera.position.y, pos.z - camera.position.z);
        const dist = to.length();
        if (dist < 22 && camDir.dot(to.normalize()) > 0.3) {
          hud.flashWhite();
          audio.flash();
        }
        bots.blindAllies(pos, 20);
      } else {
        fx.explode(pos);
        audio.explosion();
      }
    });
    if (outcome === 'boom' || outcome === 'flash') {
      // blast damage already applied inside stepGrenade
    }
  }

  // Spectate target while dead.
  if (!player.state.alive) {
    spectate = bots.bots.find((b) => b.team === 'attack' && b.alive) ?? null;
  }

  fx.step(dt, elapsed);
  refreshHud();
}

function refreshHud() {
  const ammo = weapons.ammo();
  hud.setHealth(Math.ceil(player.state.health), Math.ceil(player.state.armour));
  hud.setAmmo(ammo.mag, ammo.reserve, weapons.currentDef().name);
  hud.setMoney(rounds.state.money);
  const counts = aliveCounts();
  hud.setScore(rounds.state.scoreAttack, rounds.state.scoreDefend, rounds.state.round, counts.attack, counts.defend);
  const bomb = rounds.state.bomb;
  if (bomb.state === 'planted') {
    hud.setTimer(bomb.left, 'live');
    hud.setBombStatus(`SPIKE PLANTED AT ${bomb.site} — ${Math.ceil(bomb.left)}s`);
  } else {
    hud.setTimer(rounds.state.phaseLeft, rounds.state.phase);
    if (rounds.state.spike.carrier === 'player') hud.setBombStatus('YOU CARRY THE SPIKE — plant at A or B');
    else if (rounds.state.spike.dropped) hud.setBombStatus('SPIKE DROPPED — recover it');
    else hud.setBombStatus('');
  }
  if (phase === 'buy') hud.setHint('Buy phase — B for the buy menu');
  else if (phase === 'live') hud.setHint('E plants the spike inside a site · G grenade · right-click aim');
  else hud.setHint('');
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    const look = input.takeLook();
    player.look(look.x, look.y);
    // ADS: right mouse narrows the field of view and steadies the spread.
    const targetFov = input.state.aiming ? 58 : 74;
    if (Math.abs(camera.fov - targetFov) > 0.1) {
      camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 12);
      camera.updateProjectionMatrix();
    }
    if (input.state.firing && player.state.alive && phase === 'live') {
      if (weapons.ready()) shootPlayer(weapons.spread(player.groundSpeed(), input.state.aiming, player.state.crouching));
      else if (weapons.ammo().mag === 0 && weapons.dryFire()) audio.dry();
    }
    hud.crosshair(weapons.spread(player.groundSpeed(), input.state.aiming, player.state.crouching));
    if (input.takePressed('KeyR')) {
      if (weapons.reload()) audio.reload();
    }
    if (input.takePressed('KeyB')) {
      if (phase === 'buy') {
        if (buyOpen) {
          buyOpen = false;
          hud.hideBuy();
        } else refreshBuyMenu();
      } else {
        buyOpen = false;
        hud.hideBuy();
      }
    }
    if (phase === 'buy') {
      if (input.takePressed('Digit1')) buy('rifle');
      if (input.takePressed('Digit2')) buy('smg');
      if (input.takePressed('Digit3')) buy('he');
      if (input.takePressed('Digit4')) buy('flash');
      if (input.takePressed('Digit5')) buy('armour');
    } else {
      if (input.takePressed('Digit1')) weapons.switchTo(weapons.owned('rifle') ? 'rifle' : 'pistol');
      if (input.takePressed('Digit2')) weapons.switchTo(weapons.owned('smg') ? 'smg' : 'pistol');
      if (input.takePressed('Digit3')) weapons.switchTo('pistol');
    }
    if (input.takePressed('KeyG')) throwGrenade(weapons.state.grenades.he > 0 ? 'he' : 'flash');
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let index = 0; index < steps; index += 1) step(FIXED_STEP);
}

function aimAt(point) {
  const dx = point.x - player.body.pos.x;
  const dy = point.y - (player.body.pos.y + body.eye);
  const dz = point.z - player.body.pos.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / len)));
  syncCamera();
}

function runShot(name) {
  hud.hideOverlay();
  hud.hideBuy();
  body.pitch = 0;
  body.yaw = 0;
  if (name === 'start') {
    player.reset(world.spawns.attack[0]);
    body.yaw = 0.5;
    settle(20);
    hud.showOverlay('start');
  } else if (name === 'play') {
    rounds.state.phase = 'live';
    rounds.state.phaseLeft = ROUND_SECONDS;
    // Stage the rifle for the capture: the play shot shows the main gun.
    weapons.state.owned.rifle = true;
    weapons.switchTo('rifle');
    player.reset(new THREE.Vector3(1.5, 0, 3.2));
    body.yaw = 0;
    const defender = bots.bots.find((b) => b.team === 'defend');
    defender.body.pos.set(0.4, 0, -4.5);
    defender.yaw = Math.PI;
    const second = bots.bots.filter((b) => b.team === 'defend')[1];
    second.body.pos.set(-3.2, 0, -6);
    second.yaw = Math.PI;
    const ally = bots.bots.find((b) => b.team === 'attack');
    ally.body.pos.set(-5.5, 0, 2.5);
    ally.yaw = 0;
    settle(20);
    const point = new THREE.Vector3(defender.body.pos.x, defender.body.pos.y + 1.1, defender.body.pos.z);
    aimAt(point);
    for (let round = 0; round < 3; round += 1) {
      shootPlayer(0);
      if (round < 2) settle(10);
    }
    settle(6);
    hud.setHint('Hold the angle — the Wardens push mid');
    hud.setScore(0, 0, 1, 3, 5);
  } else {
    // end: round won at Site A, defenders down, spike planted.
    rounds.state.phase = 'end';
    rounds.state.phaseLeft = 4;
    rounds.state.scoreAttack = 1;
    rounds.state.bomb = { state: 'planted', site: 'A', pos: new THREE.Vector3(-16, 0, -9), left: 32, plant: 0 };
    player.reset(new THREE.Vector3(-13.5, 0, -6.5));
    for (const bot of bots.bots) {
      if (bot.team === 'defend') {
        bot.alive = false;
        bot.fall = 1;
        bot.group.rotation.x = -1.45;
        bot.body.pos.set(-15 + random() * 3, 0, -8 + random() * 2);
        bot.group.position.copy(bot.body.pos);
      } else {
        bot.body.pos.set(-17.5, 0, -7);
        bot.yaw = 0.8;
        bot.group.position.copy(bot.body.pos);
      }
    }
    settle(20);
    aimAt(new THREE.Vector3(-16, 1, -9));
    hud.banner('Round won', 'Site A secured — spike ticking', 60000);
    hud.setScore(1, 0, 1, 3, 0);
  }
  refreshHud();
  paintTwiceThenReady();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Clicking the canvas re-locks the mouse after a respawn or a pause.
renderer.domElement.addEventListener('click', () => {
  if (player.state.alive && !input.state.locked && started && !shot) input.requestLock();
});

syncCamera();
refreshHud();
if (shot) runShot(shot);
else requestAnimationFrame(frame);
