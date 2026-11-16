// The map: "Foundry" — a dusk industrial yard, 44 x 30 m, built from boxes.
// Two bomb sites (A west, B east), a mid lane with a door choke, flanking lanes,
// and a connector hall. Every box is a collider and a surface a bullet stops on.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

// Waypoint graph the bots walk: node [x, z], edges by index. All nodes sit in open
// space; every edge is a straight walk with no wall between its ends.
const NODES = [
  [0, 12], [-14, 8], [14, 8], [0, 6], [0, -1.5], [0, -8], [0, -12.5],
  [-8, -2.5], [8, -2.5], [-13.5, -3.5], [-16, -9], [-19.5, -12],
  [13.5, -3.5], [16, -9], [19.5, -12], [-15, 4], [15, 4], [-15, 10], [15, 10],
];
const EDGES = [
  [0, 3], [0, 1], [0, 2], [0, 17], [0, 18], [3, 4], [3, 15], [3, 16],
  [15, 9], [15, 1], [16, 12], [16, 2], [4, 7], [4, 8], [4, 5],
  [7, 9], [7, 5], [8, 12], [8, 5], [9, 10], [10, 11], [12, 13], [13, 14],
  [5, 6], [6, 9], [6, 12], [17, 1], [18, 2], [1, 17], [2, 18],
];
const HOLD_A = [10, 9, 11];
const HOLD_B = [13, 12, 14];
const HOLD_MID = [5, 7, 8];

function floorTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#57493a';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 5200; i += 1) {
    const v = 58 + Math.random() * 46;
    g.fillStyle = `rgb(${v | 0},${(v * 0.94) | 0},${(v * 0.78) | 0})`;
    g.fillRect(Math.random() * 256, Math.random() * 256, 1.6, 1.6);
  }
  g.strokeStyle = 'rgba(20,16,10,0.55)';
  g.lineWidth = 2;
  for (let i = 0; i <= 4; i += 1) {
    g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, 256); g.stroke();
    g.beginPath(); g.moveTo(0, i * 64); g.lineTo(256, i * 64); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(11, 8);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function siteTexture(letter) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 256, 256);
  g.strokeStyle = '#e8b13a';
  g.lineWidth = 10;
  g.beginPath();
  g.arc(128, 128, 104, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = '#e8b13a';
  g.font = 'bold 150px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(letter, 128, 134);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'accent' || name === 'ink' ? 0.55 : 0.92,
      metalness: name === 'steel' ? 0.45 : 0.03,
    });
  }
  const floorMat = new THREE.MeshStandardMaterial({ map: floorTexture(), roughness: 0.95, metalness: 0.02 });
  const colliders = [];
  const shootables = [];

  function box(w, h, d, x, y, z, material, collide = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), materials[material] || floorMat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (collide) {
      colliders.push(new THREE.Box3().setFromObject(mesh));
      shootables.push(mesh);
    }
    return mesh;
  }

  // Floor and outer walls (44 x 30, 5 m high).
  const floor = new THREE.Mesh(new THREE.BoxGeometry(44.6, 0.4, 30.6), floorMat);
  floor.position.set(0, -0.2, 0);
  floor.receiveShadow = true;
  group.add(floor);
  colliders.push(new THREE.Box3().setFromObject(floor));
  shootables.push(floor);
  box(0.4, 5, 30.6, -22.2, 2.5, 0, 'surface');
  box(0.4, 5, 30.6, 22.2, 2.5, 0, 'surface');
  box(44.6, 5, 0.4, 0, 2.5, -15.2, 'surface');
  box(44.6, 5, 0.4, 0, 2.5, 15.2, 'surface');

  // Site A pocket (west): inner wall x=-12 (z -14..-8) and south wall z=-5 (x -21..-15).
  box(0.4, 5, 6, -12, 2.5, -11, 'surface');
  box(6, 5, 0.4, -18, 2.5, -5, 'surface');
  // Site B pocket (east), mirrored.
  box(0.4, 5, 6, 12, 2.5, -11, 'surface');
  box(6, 5, 0.4, 18, 2.5, -5, 'surface');

  // Mid wall at z=0 with a single door gap (x -1..1) — the mid choke.
  box(10, 5, 0.4, -6, 2.5, 0, 'surface');
  box(10, 5, 0.4, 6, 2.5, 0, 'surface');

  // Pillars.
  for (const [x, z] of [[-8, -8], [8, -8], [-8, 6], [8, 6]]) box(1.2, 4, 1.2, x, 2, z, 'steel');
  // Crouch cover crates (1.1 m) and tall cover (2.2 m).
  for (const [x, z, w, d] of [[-4, -6, 1.6, 1.2], [4, -6, 1.6, 1.2], [-16, -9, 2, 1.2], [16, -9, 2, 1.2], [-19, -12, 1.2, 1.2], [19, -12, 1.2, 1.2], [0, 4, 1.2, 1.2], [-15, 4, 1.2, 1.2], [15, 4, 1.2, 1.2]]) {
    box(w, 1.1, d, x, 0.55, z, 'hairline');
  }
  for (const [x, z] of [[-18, -7], [18, -7], [-6, -11], [6, -11]]) box(1.2, 2.2, 1.2, x, 1.1, z, 'rust');
  // Low platforms on both sites — a step up for a sightline over the crates.
  box(4, 0.5, 3, -16, 0.25, -12, 'concrete');
  box(4, 0.5, 3, 16, 0.25, -12, 'concrete');
  // Rust containers near T spawn.
  box(2.4, 2.2, 2.4, -20, 1.1, 8, 'rust');
  box(2.4, 2.2, 2.4, 20, 1.1, 8, 'rust');
  box(2.4, 0.9, 1.2, -10, 0.45, 10, 'hairline');
  box(2.4, 0.9, 1.2, 10, 0.45, 10, 'hairline');

  // Bomb-site floor decals.
  for (const [letter, x] of [['A', -16], ['B', 16]]) {
    const decal = new THREE.Mesh(
      new THREE.PlaneGeometry(4.4, 4.4),
      new THREE.MeshBasicMaterial({ map: siteTexture(letter), transparent: true, opacity: 0.85, depthWrite: false }),
    );
    decal.rotation.x = -Math.PI / 2;
    decal.position.set(x, 0.02, -9);
    group.add(decal);
  }

  // Distant skyline silhouettes, outside the walls, for depth at dusk.
  const skyMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#241d16') });
  const skyGeo = new THREE.BoxGeometry(1, 1, 1);
  const skyline = [[-30, 6, -24, 8, 14, 6], [-14, 4, -30, 10, 20, 8], [6, 8, -28, 7, 26, 5], [24, 5, -22, 9, 12, 7], [-28, 10, 18, 6, 18, 5], [28, 8, 20, 8, 22, 6], [0, 12, -34, 12, 30, 4]];
  for (const [x, y, z, w, h, d] of skyline) {
    const m = new THREE.Mesh(skyGeo, skyMat);
    m.scale.set(w, h, d);
    m.position.set(x, y, z);
    group.add(m);
  }
  // A low amber sun disc on the horizon.
  const sun = new THREE.Mesh(
    new THREE.CircleGeometry(3.2, 32),
    new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffb36b'), fog: false }),
  );
  sun.position.set(-26, 7, -30);
  sun.lookAt(0, 4, 0);
  group.add(sun);

  // Light: amber dusk key with shadows, cool fill, warm lamps over both sites.
  const hemi = new THREE.HemisphereLight(new THREE.Color('#6b5a44'), new THREE.Color('#171310'), 1.25);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(new THREE.Color('#ffb36b'), 2.9);
  key.position.set(14, 20, 10);
  key.target.position.set(-4, 0, -4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -28;
  key.shadow.camera.right = 28;
  key.shadow.camera.top = 28;
  key.shadow.camera.bottom = -28;
  key.shadow.camera.far = 70;
  key.shadow.bias = -0.0006;
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(new THREE.Color('#5a6b7a'), 0.6);
  fill.position.set(-12, 14, -10);
  scene.add(fill);
  for (const x of [-16, 16]) {
    const lamp = new THREE.PointLight(new THREE.Color('#ffb36b'), 14, 16, 1.8);
    lamp.position.set(x, 4.2, -9);
    scene.add(lamp);
  }

  // Waypoint adjacency for BFS.
  const adj = NODES.map(() => []);
  for (const [a, b] of EDGES) {
    adj[a].push(b);
    adj[b].push(a);
  }
  function nearestNode(x, z) {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < NODES.length; i += 1) {
      const d = (NODES[i][0] - x) ** 2 + (NODES[i][1] - z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }
  function findPath(from, to) {
    if (from === to) return [to];
    const prev = new Array(NODES.length).fill(-1);
    const queue = [from];
    prev[from] = from;
    while (queue.length) {
      const cur = queue.shift();
      for (const next of adj[cur]) {
        if (prev[next] !== -1) continue;
        prev[next] = cur;
        if (next === to) {
          const path = [to];
          let node = to;
          while (node !== from) {
            node = prev[node];
            path.unshift(node);
          }
          return path;
        }
        queue.push(next);
      }
    }
    return [to];
  }

  return {
    colliders,
    shootables,
    group,
    sites: {
      A: { center: new THREE.Vector3(-16, 0, -9), radius: 4.2 },
      B: { center: new THREE.Vector3(16, 0, -9), radius: 4.2 },
    },
    spawns: {
      attack: [new THREE.Vector3(0, 0, 12.5), new THREE.Vector3(-2.5, 0, 12.5), new THREE.Vector3(2.5, 0, 12.5)],
      defend: [new THREE.Vector3(-3, 0, -12.5), new THREE.Vector3(0, 0, -12.5), new THREE.Vector3(3, 0, -12.5)],
    },
    nav: { nodes: NODES, adj, nearestNode, findPath, holdA: HOLD_A, holdB: HOLD_B, holdMid: HOLD_MID },
  };
}
