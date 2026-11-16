// The look plan, in one place: a dusk foundry — amber sun, teal steel, concrete dust.
// Every colour in the game comes from these names; the same names are the CSS custom
// properties in index.html, so the HUD and the 3D scene share one palette.
export const PALETTE = {
  canvas: '#1a1611',
  sky: '#2b2620',
  surface: '#3a342c',
  concrete: '#57503f',
  hairline: '#2e2a24',
  steel: '#4d5a63',
  rust: '#8a4a2b',
  ink: '#ece5d3',
  muted: '#9a917e',
  accent: '#f0a830',
  hazard: '#e8c33a',
  site: '#e8b13a',
  team: '#4f8fd0',
  enemy: '#d05a4f',
};

export function shade(name) {
  return PALETTE[name];
}
