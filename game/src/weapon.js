// The arsenal: three guns and two grenades. A weapon owns its numbers, its magazine,
// its bloom and its view model; main.js owns the ray and the damage.
// Spread punishes moving and spraying; stopping, crouching and aiming pay.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  pistol: { id: 'pistol', name: 'P9 Sidearm', price: 0, damage: 26, headMult: 4, mag: 12, reserve: 48, gap: 0.14, auto: false, reload: 1.4, spreadStill: 0.003, spreadMove: 0.02, recoil: 0.011, range: 30, slot: 2 },
  smg: { id: 'smg', name: 'Kestrel-9', price: 1500, damage: 22, headMult: 4, mag: 32, reserve: 96, gap: 0.062, auto: true, reload: 1.8, spreadStill: 0.004, spreadMove: 0.02, recoil: 0.008, range: 25, slot: 1 },
  rifle: { id: 'rifle', name: 'VK-7 Repeater', price: 2700, damage: 34, headMult: 4, mag: 30, reserve: 90, gap: 0.096, auto: true, reload: 2.1, spreadStill: 0.0022, spreadMove: 0.028, recoil: 0.014, range: 60, slot: 1 },
};
export const GRENADES = {
  he: { id: 'he', name: 'Boomer HE', price: 300 },
  flash: { id: 'flash', name: 'Dazzler Flash', price: 200 },
};

function buildModel(def) {
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.2 });
  const metal = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.35 });
  const accent = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.5, metalness: 0.2 });
  const group = new THREE.Group();
  const len = def.id === 'pistol' ? 0.22 : def.id === 'smg' ? 0.34 : 0.46;
  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, len), metal);
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, len * 0.8), dark);
  barrel.position.set(0, 0.025, -len * 0.55);
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.08, 0.2), dark);
  stock.position.set(0, -0.02, len * 0.42);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.14, 0.07), dark);
  grip.position.set(0, -0.11, len * 0.28);
  grip.rotation.x = 0.3;
  group.add(receiver, barrel, stock, grip);
  if (def.id !== 'pistol') {
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, 0.06), accent);
    sight.position.set(0, 0.075, -0.05);
    group.add(sight);
  }
  group.position.set(0.24, -0.2, -0.42);
  return group;
}

export function createWeapons(camera) {
  const models = {};
  for (const def of Object.values(WEAPONS)) {
    models[def.id] = buildModel(def);
    models[def.id].visible = false;
    camera.add(models[def.id]);
  }
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.26, 0.26),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.24, -0.17, -0.95);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.24, -0.16, -0.6);
  camera.add(flashLight);

  const state = {
    current: 'pistol',
    owned: { pistol: true },
    ammo: {
      pistol: { mag: 12, reserve: 48 },
      smg: { mag: 32, reserve: 96 },
      rifle: { mag: 30, reserve: 90 },
    },
    grenades: { he: 0, flash: 0 },
    cooldown: 0,
    reloadLeft: 0,
    flash: 0,
    kick: 0,
    bloom: 0,
    switchLeft: 0,
  };
  models.pistol.visible = true;

  function def() {
    return WEAPONS[state.current];
  }

  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.switchLeft = Math.max(0, state.switchLeft - dt);
    state.bloom = Math.max(0, state.bloom - dt * 0.05);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    const model = models[state.current];
    model.position.z = -0.42 + state.kick;
    model.rotation.x = state.kick * 2.2;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      const d = def();
      model.rotation.x = -0.55 * Math.min(1, (d.reload - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const ammo = state.ammo[state.current];
        const need = d.mag - ammo.mag;
        const take = Math.min(need, ammo.reserve);
        ammo.mag += take;
        ammo.reserve -= take;
      }
    }
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 30;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
  }

  return {
    state,
    def,
    step,
    currentDef() {
      return def();
    },
    ammo() {
      return state.ammo[state.current];
    },
    owned(id) {
      return !!state.owned[id];
    },
    buy(id) {
      state.owned[id] = true;
      const d = WEAPONS[id];
      state.ammo[id] = { mag: d.mag, reserve: d.reserve };
    },
    buyGrenade(id) {
      state.grenades[id] += 1;
    },
    takeGrenade(id) {
      if (state.grenades[id] <= 0) return false;
      state.grenades[id] -= 1;
      return true;
    },
    switchTo(id) {
      if (!state.owned[id] || state.current === id || state.switchLeft > 0) return false;
      models[state.current].visible = false;
      state.current = id;
      models[id].visible = true;
      state.switchLeft = 0.25;
      state.reloadLeft = 0;
      state.bloom = 0;
      return true;
    },
    ready() {
      const ammo = state.ammo[state.current];
      return ammo.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0 && state.switchLeft === 0;
    },
    // Fires one round: consumes ammo, starts the cooldown and the bloom, kicks the
    // view model. Returns false when nothing left to fire.
    pullTrigger() {
      const ammo = state.ammo[state.current];
      if (ammo.mag <= 0 || state.cooldown > 0 || state.reloadLeft > 0) return false;
      ammo.mag -= 1;
      state.cooldown = def().gap;
      state.flash = 0.06;
      state.kick = 0.055;
      state.bloom = Math.min(0.05, state.bloom + 0.006);
      return true;
    },
    reload() {
      const d = def();
      const ammo = state.ammo[state.current];
      if (state.reloadLeft > 0 || ammo.mag === d.mag || ammo.reserve === 0) return false;
      state.reloadLeft = d.reload;
      return true;
    },
    dryFire() {
      if (state.cooldown > 0) return false;
      state.cooldown = 0.25;
      return true;
    },
    // Spread in radians: still + moving + bloom, halved while aiming down sights.
    spread(speed, aiming, crouching) {
      const d = def();
      const move = Math.min(1, speed / 5.2) * d.spreadMove;
      let s = d.spreadStill + move + state.bloom;
      if (crouching) s *= 0.75;
      if (aiming) s *= 0.6;
      return s;
    },
    refill() {
      for (const id of Object.keys(state.ammo)) {
        const d = WEAPONS[id];
        state.ammo[id] = { mag: d.mag, reserve: d.reserve };
      }
      state.grenades = { he: 0, flash: 0 };
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
      state.bloom = 0;
    },
  };
}
