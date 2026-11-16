// Transient effects: tracers, impact sparks, explosions and the spike marker.
// Nothing allocates per frame in the hot loop — a small pool of line/point objects
// is reused, and dead ones hide until needed.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const TRACER_MAX = 24;
const SPARK_MAX = 10;

export function createFx(scene) {
  const tracers = [];
  const tracerMat = new THREE.LineBasicMaterial({
    color: new THREE.Color(PALETTE.accent),
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  for (let i = 0; i < TRACER_MAX; i += 1) {
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const line = new THREE.Line(geo, tracerMat.clone());
    line.visible = false;
    line.frustumCulled = false;
    scene.add(line);
    tracers.push({ line, left: 0 });
  }
  const sparks = [];
  for (let i = 0; i < SPARK_MAX; i += 1) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12 * 3), 3));
    const points = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ color: new THREE.Color(PALETTE.accent), size: 0.07, transparent: true, opacity: 1, depthWrite: false }),
    );
    points.visible = false;
    points.frustumCulled = false;
    scene.add(points);
    sparks.push({ points, left: 0, vel: [] });
  }
  const explosion = new THREE.Mesh(
    new THREE.SphereGeometry(1, 20, 14),
    new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffcf5e'), transparent: true, opacity: 0, depthWrite: false }),
  );
  explosion.visible = false;
  scene.add(explosion);
  const explosionLight = new THREE.PointLight(new THREE.Color('#ff9a3c'), 0, 22, 1.6);
  scene.add(explosionLight);
  let explosionLeft = 0;

  // The spike: a small amber diamond that marks where it lies when dropped.
  const spike = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.22),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.site) }),
  );
  spike.visible = false;
  scene.add(spike);
  const spikeLight = new THREE.PointLight(new THREE.Color(PALETTE.site), 0, 6, 1.8);
  scene.add(spikeLight);

  return {
    tracer(from, to) {
      const slot = tracers.find((t) => t.left <= 0) ?? tracers[0];
      const pos = slot.line.geometry.attributes.position;
      pos.setXYZ(0, from.x, from.y, from.z);
      pos.setXYZ(1, to.x, to.y, to.z);
      pos.needsUpdate = true;
      slot.line.visible = true;
      slot.left = 0.07;
    },
    impact(point) {
      const slot = sparks.find((s) => s.left <= 0) ?? sparks[0];
      const pos = slot.points.geometry.attributes.position;
      slot.vel = [];
      for (let i = 0; i < 12; i += 1) {
        pos.setXYZ(i, point.x, point.y, point.z);
        slot.vel.push(new THREE.Vector3((Math.random() - 0.5) * 4, Math.random() * 3, (Math.random() - 0.5) * 4));
      }
      pos.needsUpdate = true;
      slot.points.visible = true;
      slot.left = 0.35;
    },
    explode(point) {
      explosion.position.copy(point);
      explosion.visible = true;
      explosion.scale.setScalar(0.5);
      explosionLight.position.copy(point).y += 1;
      explosionLeft = 0.6;
    },
    showSpike(pos) {
      spike.position.set(pos.x, 0.5, pos.z);
      spike.visible = true;
      spikeLight.position.set(pos.x, 1, pos.z);
      spikeLight.intensity = 6;
    },
    hideSpike() {
      spike.visible = false;
      spikeLight.intensity = 0;
    },
    step(dt, time) {
      for (const t of tracers) {
        if (t.left <= 0) continue;
        t.left -= dt;
        t.line.material.opacity = Math.max(0, t.left / 0.07) * 0.9;
        if (t.left <= 0) t.line.visible = false;
      }
      for (const s of sparks) {
        if (s.left <= 0) continue;
        s.left -= dt;
        const pos = s.points.geometry.attributes.position;
        for (let i = 0; i < 12; i += 1) {
          pos.setXYZ(i, pos.getX(i) + s.vel[i].x * dt, pos.getY(i) + s.vel[i].y * dt, pos.getZ(i) + s.vel[i].z * dt);
          s.vel[i].y -= 9 * dt;
        }
        pos.needsUpdate = true;
        s.points.material.opacity = Math.max(0, s.left / 0.35);
        if (s.left <= 0) s.points.visible = false;
      }
      if (explosionLeft > 0) {
        explosionLeft -= dt;
        const t = 1 - explosionLeft / 0.6;
        explosion.scale.setScalar(0.5 + t * 6);
        explosion.material.opacity = Math.max(0, 0.9 - t);
        explosionLight.intensity = Math.max(0, 60 * (1 - t));
        if (explosionLeft <= 0) {
          explosion.visible = false;
          explosionLight.intensity = 0;
        }
      }
      if (spike.visible) {
        spike.rotation.y = time * 2;
        spike.position.y = 0.5 + Math.sin(time * 3) * 0.08;
      }
    },
  };
}
