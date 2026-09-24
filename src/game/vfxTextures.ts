import * as THREE from 'three';

/** Procedural canvas textures for shot and blood effects; every call draws a fresh random variant. */

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function texture(c: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Front view of the flash: a white-hot core with irregular orange petals. */
export function starTexture(): THREE.CanvasTexture {
  const size = 128;
  const r = size / 2;
  const [c, ctx] = canvas(size, size);
  ctx.globalCompositeOperation = 'lighter';
  ctx.translate(r, r);

  const petals = 5 + Math.floor(Math.random() * 4);
  for (let i = 0; i < petals; i++) {
    const len = r * (0.55 + Math.random() * 0.45);
    ctx.save();
    ctx.rotate((i / petals) * Math.PI * 2 + (Math.random() - 0.5) * 0.6);
    ctx.scale(1, 0.12 + Math.random() * 0.12);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, len);
    g.addColorStop(0, 'rgba(255,230,170,0.9)');
    g.addColorStop(0.35, 'rgba(255,150,50,0.55)');
    g.addColorStop(1, 'rgba(200,60,10,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(len * 0.35, 0, len, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  const core = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.42);
  core.addColorStop(0, 'rgba(255,255,245,1)');
  core.addColorStop(0.3, 'rgba(255,220,140,0.85)');
  core.addColorStop(1, 'rgba(255,110,30,0)');
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.42, 0, Math.PI * 2);
  ctx.fill();
  return texture(c);
}

/** Side view of the flame jet: bright at the barrel (bottom), tapering and flickering to the tip. */
export function flameTexture(): THREE.CanvasTexture {
  const w = 64;
  const h = 128;
  const [c, ctx] = canvas(w, h);
  ctx.globalCompositeOperation = 'lighter';
  const blobs = 7;
  for (let i = 0; i < blobs; i++) {
    const t = i / (blobs - 1);
    const y = h * (1 - t * 0.85);
    const x = w / 2 + (Math.random() - 0.5) * w * 0.25 * t;
    const rad = w * (0.42 - t * 0.28) * (0.8 + Math.random() * 0.4);
    const a = 0.75 * (1 - t) + 0.15;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, `rgba(255,${Math.round(235 - t * 90)},${Math.round(170 - t * 140)},${a})`);
    g.addColorStop(1, 'rgba(180,50,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.fill();
  }
  return texture(c);
}

/** Soft, lumpy grey puff for gun smoke. */
export function smokeTexture(): THREE.CanvasTexture {
  const size = 64;
  const r = size / 2;
  const [c, ctx] = canvas(size, size);
  for (let i = 0; i < 9; i++) {
    const x = r + (Math.random() - 0.5) * r * 0.8;
    const y = r + (Math.random() - 0.5) * r * 0.8;
    const rad = r * (0.35 + Math.random() * 0.3);
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.fill();
  }
  return texture(c);
}

/** Round blood droplet with a darker rim. */
export function dropletTexture(): THREE.CanvasTexture {
  const size = 32;
  const r = size / 2;
  const [c, ctx] = canvas(size, size);
  const g = ctx.createRadialGradient(r * 0.8, r * 0.8, 0, r, r, r);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.6, 'rgba(200,200,200,0.95)');
  g.addColorStop(1, 'rgba(120,120,120,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(r, r, r, 0, Math.PI * 2);
  ctx.fill();
  return texture(c);
}

/** Blood splat seen from above: a lumpy pool with satellite drops and streaks. White, tinted by the material. */
export function splatTexture(): THREE.CanvasTexture {
  const size = 128;
  const r = size / 2;
  const [c, ctx] = canvas(size, size);
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  const blob = (x: number, y: number, rad: number) => {
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.fill();
  };
  for (let i = 0; i < 7; i++) {
    blob(r + (Math.random() - 0.5) * r * 0.5, r + (Math.random() - 0.5) * r * 0.5, r * (0.15 + Math.random() * 0.2));
  }
  const streaks = 5 + Math.floor(Math.random() * 6);
  for (let i = 0; i < streaks; i++) {
    const a = Math.random() * Math.PI * 2;
    const len = r * (0.45 + Math.random() * 0.5);
    for (let t = 0.3; t < 1; t += 0.12) {
      blob(r + Math.cos(a) * len * t, r + Math.sin(a) * len * t, r * 0.07 * (1.2 - t) + 1);
    }
    blob(r + Math.cos(a) * len * 1.05, r + Math.sin(a) * len * 1.05, r * (0.03 + Math.random() * 0.04));
  }
  // Darker, drier edge: fade the rim a little.
  ctx.globalCompositeOperation = 'destination-in';
  const g = ctx.createRadialGradient(r, r, r * 0.4, r, r, r);
  g.addColorStop(0, 'rgba(0,0,0,1)');
  g.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return texture(c);
}
