/* Kept Words — painted backgrounds. Every scene is drawn from a seed, so the same seed always gives the same picture. */
"use strict";
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function noise(r) { const p = new Float32Array(512); for (let i = 0; i < 512; i++) p[i] = r(); return x => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return p[i & 511] * (1 - u) + p[(i + 1) & 511] * u; }; }
function fbm(n, x, o = 5) { let s = 0, a = .5, f = 1, t = 0; for (let k = 0; k < o; k++) { s += a * n(x * f + k * 31.7); t += a; a *= .5; f *= 2.07; } return s / t; }
const hx = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const rgba = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];

// sky top, sky mid, horizon, sun, far land, near land
const DAY = [
  ["#1b1f4b", "#6b3f7a", "#f29e7c", "#ffd9a8", "#8a5a86", "#1a1430"],
  ["#8fb6df", "#cfdcec", "#f7d9c4", "#fff4e0", "#9fb4cc", "#2f3e55"],
  ["#3d5a80", "#e3a75f", "#ffd38a", "#fff1c9", "#b07a5c", "#2b1d1a"],
  ["#061a26", "#0f3b4a", "#4f8f8f", "#d6efe9", "#24545e", "#04121a"],
  ["#e9b8b6", "#f6d6cb", "#fde9d9", "#fff7ee", "#c99aa6", "#5a3c50"],
  ["#2f6fc9", "#7fb0e6", "#d7e9f7", "#ffffff", "#7f9cbd", "#1f3046"],
  ["#2a0e1f", "#8c2f39", "#f08a4b", "#ffd36e", "#6e2a3a", "#150910"],
  ["#22304f", "#56628f", "#c9a7c7", "#ffe6d0", "#5d6487", "#151a2e"],
  ["#0d2b3e", "#2f6c80", "#e8b77d", "#fff0cf", "#3b6070", "#0b1a22"],
].map(p => p.map(hx));
const NIGHT = [
  ["#02030a", "#0b1236", "#2b2f6b", "#8d7cf0"],
  ["#000308", "#06142b", "#14405f", "#4fb3d9"],
  ["#05020c", "#1c0b2e", "#4a1d4f", "#d2668a"],
  ["#01050a", "#0a1d26", "#1e4a4a", "#7fd6b8"],
].map(p => p.map(hx));
const FOG = [
  ["#c4cfd3", "#eef1ee", "#1d2a26"],
  ["#d6c6b8", "#f4ebe1", "#3a2b26"],
  ["#9eb0c5", "#e4e9f0", "#18222f"],
  ["#bcc8b0", "#eff1e5", "#202c1c"],
  ["#c9b7cc", "#f1e8ef", "#2c2232"],
].map(p => p.map(hx));
const AURORA = [["#59f5b0", "#2bd3c4"], ["#7cf59a", "#c07cff"], ["#3ee0d0", "#ff7cc8"], ["#a0ff8a", "#59c8ff"]].map(p => p.map(hx));

function skyGrad(x, W, h, top, mid, hor, midAt = .55) {
  const g = x.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, rgba(top)); g.addColorStop(midAt, rgba(mid)); g.addColorStop(1, rgba(hor));
  x.fillStyle = g; x.fillRect(0, 0, W, h + 1);
}
function glow(x, cx, cy, r, c, a) {
  const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, rgba(c, a)); g.addColorStop(.35, rgba(c, a * .35)); g.addColorStop(1, rgba(c, 0));
  x.fillStyle = g; x.fillRect(cx - r, cy - r, r * 2, r * 2);
}
function sun(x, cx, cy, rad, c, W) {
  glow(x, cx, cy, W * 1.1, c, .45);
  glow(x, cx, cy, rad * 3.2, c, .6);
  x.fillStyle = rgba(c, .96); x.beginPath(); x.arc(cx, cy, rad, 0, 7); x.fill();
}
function ridge(x, W, H, n, base, amp, freq, sharp, col) {
  x.beginPath(); x.moveTo(0, H);
  const step = Math.max(1, W / 360);
  for (let px = 0; px <= W + step; px += step) {
    const u = px / W * freq;
    let v = fbm(n, u, 6);
    if (sharp) { const rr = 1 - Math.abs(2 * fbm(n, u * .5 + 9, 4) - 1); v = v * .45 + rr * rr * .75; }
    x.lineTo(px, base - (v - .45) * amp * 2);
  }
  x.lineTo(W, H); x.closePath(); x.fillStyle = col; x.fill();
}
function band(x, W, y0, y1, c, a0, a1) {
  const g = x.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, rgba(c, a0)); g.addColorStop(1, rgba(c, a1));
  x.fillStyle = g; x.fillRect(0, y0, W, y1 - y0);
}
function pine(x, cx, yb, h, w) {
  const tiers = 4 + (h > 40 ? 2 : 0);
  x.moveTo(cx, yb - h);
  for (let k = 1; k <= tiers; k++) { const yy = yb - h + h * k / tiers * .92; const ww = w * (.35 + .65 * k / tiers); x.lineTo(cx + ww, yy); if (k < tiers) x.lineTo(cx + ww * .4, yy - h * .03); }
  x.lineTo(cx + w * .07, yb - h * .08); x.lineTo(cx + w * .07, yb + 2); x.lineTo(cx - w * .07, yb + 2); x.lineTo(cx - w * .07, yb - h * .08);
  for (let k = tiers; k >= 1; k--) { const yy = yb - h + h * k / tiers * .92; const ww = w * (.35 + .65 * k / tiers); if (k < tiers) x.lineTo(cx - ww * .4, yy - h * .03); x.lineTo(cx - ww, yy); }
  x.closePath();
}
function treeLine(x, r, W, n, base, amp, freq, minH, maxH, col, density = 1) {
  x.beginPath();
  let px = -10;
  while (px < W + 10) {
    const g = base - (fbm(n, px / W * freq, 4) - .5) * amp * 2;
    const h = minH + (maxH - minH) * Math.pow(r(), 1.3);
    pine(x, px, g, h, h * (.22 + r() * .1));
    px += (h * .18 + r() * h * .35) / density;
  }
  x.fillStyle = col; x.fill();
  // ground under the trees
  ridge(x, W, x.canvas.height, n, base + maxH * .05, amp, freq, false, col);
}
function stars(x, r, W, H, h, count) {
  for (let i = 0; i < count; i++) {
    const sx = r() * W, sy = Math.pow(r(), 1.25) * h, s = Math.pow(r(), 7) * 2.2 + .35;
    x.fillStyle = `rgba(255,255,255,${(.25 + r() * .75).toFixed(2)})`;
    x.fillRect(sx, sy, s, s);
    if (s > 1.9) glow(x, sx, sy, s * 5, [255, 255, 255], .25);
  }
}

const SCENES = {
  mountains(x, W, H, r) {
    const P = pick(r, DAY), n = noise(r);
    const hor = H * (.52 + r() * .12);
    skyGrad(x, W, hor + H * .08, P[0], P[1], P[2]);
    if (r() < .8) sun(x, W * (.18 + r() * .64), hor - H * (.03 + r() * .12), W * (.045 + r() * .04), P[3], W);
    const L = 5 + Math.floor(r() * 3);
    for (let i = 0; i < L; i++) {
      const t = i / (L - 1);
      const col = mix(mix(P[2], P[4], .55), P[5], Math.pow(t, .85));
      const base = hor - H * .1 + t * H * .42;
      ridge(x, W, H, noise(r), base, H * (.14 - .06 * t), 1.6 + (1 - t) * 2.2 + r(), i < 3, rgba(col));
      if (i < L - 1) band(x, W, base - H * .02, base + H * .11, P[2], 0, .22 * (1 - t * .5));
    }
  },
  lake(x, W, H, r) {
    const P = pick(r, DAY);
    const hor = H * (.56 + r() * .06);
    skyGrad(x, W, hor, P[0], P[1], P[2]);
    if (r() < .75) sun(x, W * (.2 + r() * .6), hor - H * (.05 + r() * .12), W * (.04 + r() * .035), P[3], W);
    const L = 4;
    for (let i = 0; i < L; i++) {
      const t = i / (L - 1);
      const col = mix(mix(P[2], P[4], .5), P[5], Math.pow(t, .9) * .9);
      const base = hor - H * (.13 - t * .1);
      x.save(); x.beginPath(); x.rect(0, 0, W, hor); x.clip();
      ridge(x, W, H, noise(r), base, H * (.13 - .05 * t), 1.6 + (1 - t) * 2.4 + r(), i < 2, rgba(col));
      x.restore();
      band(x, W, base - H * .01, hor, P[2], 0, .18);
    }
    // mirrored water
    x.save(); x.translate(0, hor * 2); x.scale(1, -1);
    x.globalAlpha = .82; x.drawImage(x.canvas, 0, 0, W, hor, 0, 0, W, hor);
    x.restore();
    band(x, W, hor, H, mix(P[5], P[1], .2), .25, .8);
    for (let i = 0; i < 160; i++) {
      const y = hor + Math.pow(r(), 1.6) * (H - hor);
      const w = W * (.05 + r() * .35) * (1 + (y - hor) / H);
      x.fillStyle = rgba(mix(P[2], [255, 255, 255], .4), .05 + r() * .09);
      x.fillRect(r() * W - w / 2, y, w, Math.max(1, H / 900));
    }
    x.fillStyle = rgba(mix(P[2], [255, 255, 255], .5), .45); x.fillRect(0, hor, W, Math.max(1, H / 1200));
  },
  ocean(x, W, H, r) {
    const P = pick(r, DAY);
    const hor = H * (.54 + r() * .1);
    skyGrad(x, W, hor, P[0], P[1], P[2], .6);
    const sx = W * (.3 + r() * .4), sy = hor - H * (.005 + r() * .07), sr = W * (.05 + r() * .04);
    // soft clouds near horizon
    for (let i = 0; i < 26; i++) { const cy = hor - H * (.04 + r() * .25); x.fillStyle = rgba(mix(P[2], P[3], r()), .05 + r() * .07); x.beginPath(); x.ellipse(r() * W, cy, W * (.15 + r() * .3), H * (.004 + r() * .01), 0, 0, 7); x.fill(); }
    x.save(); x.beginPath(); x.rect(0, 0, W, hor); x.clip(); sun(x, sx, sy, sr, P[3], W); x.restore();
    if (r() < .55) { const n = noise(r); const ix = r() * W * .6; x.save(); x.beginPath(); x.rect(ix, 0, W * (.25 + r() * .3), hor); x.clip(); ridge(x, W, hor, n, hor + H * .002, H * .035, 6, false, rgba(mix(P[4], P[5], .4), .9)); x.restore(); }
    const g = x.createLinearGradient(0, hor, 0, H);
    g.addColorStop(0, rgba(mix(P[2], P[5], .35))); g.addColorStop(.25, rgba(mix(P[1], P[5], .55))); g.addColorStop(1, rgba(mix(P[0], P[5], .6)));
    x.fillStyle = g; x.fillRect(0, hor, W, H - hor);
    for (let y = hor; y < H; y += Math.max(2, H / 420)) {
      const t = (y - hor) / (H - hor);
      const bw = W * (.03 + .32 * t);
      for (let k = 0; k < 3; k++) {
        const w = bw * (.2 + r() * .9);
        x.fillStyle = rgba(P[3], (.55 * (1 - t) + .05) * r());
        x.fillRect(sx + (r() - .5) * bw * 1.4 - w / 2, y, w, Math.max(1, H / 700) * (1 + t * 2));
      }
      if (r() < .5) { const w = W * (.02 + r() * .1) * (1 + t * 3); x.fillStyle = rgba(mix(P[2], [255, 255, 255], .3), .05 + r() * .08); x.fillRect(r() * W, y, w, Math.max(1, H / 900) * (1 + t * 2)); }
    }
  },
  night(x, W, H, r) {
    const P = pick(r, NIGHT);
    skyGrad(x, W, H, P[0], P[1], P[2], .6);
    const a = r() * .5 + .1, b = r() * .5 + .3;
    // milky way
    x.save(); x.translate(0, H * a); x.rotate(Math.atan2(H * (b - a), W)); const len = Math.hypot(W, H);
    for (let i = 0; i < 40; i++) glow(x, r() * len, (r() - .5) * H * .1, H * (.06 + r() * .1), mix(P[3], [255, 255, 255], .4), .05 + r() * .05);
    for (let i = 0; i < 4200; i++) { const g = (r() + r() + r() - 1.5) * H * .07; x.fillStyle = `rgba(255,255,255,${(r() * .75).toFixed(2)})`; const z = r() < .1 ? 1.6 : 1; x.fillRect(r() * len, g, z, z); }
    x.restore();
    stars(x, r, W, H, H * .85, Math.floor(W * H / 520));
    glow(x, W * r(), H * .9, W * 1.1, P[3], .18);
    if (r() < .35) { const mx = W * (.2 + r() * .6), my = H * (.12 + r() * .2), mr = W * .05; glow(x, mx, my, mr * 8, [230, 235, 255], .18); x.fillStyle = "rgba(240,243,255,.95)"; x.beginPath(); x.arc(mx, my, mr, 0, 7); x.fill(); }
    const n = noise(r), base = H * (.8 + r() * .06);
    if (r() < .6) treeLine(x, r, W, n, base, H * .05, 2, H * .03, H * .11, "rgb(3,4,9)", .9);
    else ridge(x, W, H, n, base, H * .08, 3, true, "rgb(3,4,9)");
  },
  aurora(x, W, H, r) {
    const P = pick(r, NIGHT), A = pick(r, AURORA);
    skyGrad(x, W, H, [1, 4, 10], P[1], mix(P[2], A[0], .25), .65);
    stars(x, r, W, H, H * .75, Math.floor(W * H / 1700));
    const ref = 100;
    x.globalCompositeOperation = "lighter";
    for (let rib = 0; rib < 2; rib++) {
      const n = noise(r), m = noise(r), c = A[rib], top = H * (.18 + r() * .2 + rib * .08);
      const g = x.createLinearGradient(0, 0, 0, ref);
      g.addColorStop(0, rgba(c, 0)); g.addColorStop(.55, rgba(c, .16)); g.addColorStop(.9, rgba(mix(c, [255, 255, 255], .25), .6)); g.addColorStop(1, rgba(c, 0));
      x.fillStyle = g;
      const step = Math.max(1, W / 280);
      for (let px = 0; px < W; px += step) {
        const u = px / W;
        const y = top + (fbm(n, u * 2.2, 4) - .5) * H * .35;
        const L = H * (.12 + .3 * fbm(m, u * 3 + 5, 3));
        const a = Math.pow(fbm(m, u * 9, 3), 2.2) * 1.9 * (rib ? .7 : 1);
        x.save(); x.globalAlpha = Math.min(1, a); x.translate(px, y - L); x.scale(1, L / ref); x.fillRect(0, 0, step + .6, ref); x.restore();
      }
    }
    x.globalCompositeOperation = "source-over";
    const n = noise(r), snow = [200, 214, 228];
    ridge(x, W, H, n, H * .72, H * .1, 2.5, true, rgba(mix(snow, A[0], .12)));
    band(x, W, H * .64, H, [10, 20, 30], .05, .65);
    treeLine(x, r, W, noise(r), H * .86, H * .03, 1.6, H * .05, H * .16, "rgb(4,8,12)", .7);
  },
  forest(x, W, H, r) {
    const P = pick(r, FOG);
    skyGrad(x, W, H, P[0], P[1], P[1], .5);
    if (r() < .6) glow(x, W * (.2 + r() * .6), H * (.2 + r() * .15), W * .9, [255, 250, 235], .35);
    const L = 5;
    for (let i = 0; i < L; i++) {
      const t = i / (L - 1);
      const col = rgba(mix(mix(P[0], P[2], .25), P[2], Math.pow(t, 1.25)));
      const base = H * (.42 + t * .42);
      treeLine(x, r, W, noise(r), base, H * (.04 + t * .02), 1.5 + r(), H * (.03 + t * .08), H * (.07 + t * .22), col, .8 + t * .3);
      if (i < L - 1) band(x, W, base - H * .08, base + H * .07, P[1], 0, .55 - t * .15);
    }
  },
  dunes(x, W, H, r) {
    const P = pick(r, [DAY[0], DAY[2], DAY[4], DAY[6], DAY[7], DAY[8]]);
    const hor = H * (.5 + r() * .1);
    skyGrad(x, W, hor + 2, P[0], P[1], P[2]);
    sun(x, W * (.2 + r() * .6), hor - H * (.02 + r() * .1), W * (.05 + r() * .03), P[3], W);
    const sand = mix(hx("#e2a46b"), P[2], .35), dark = mix(hx("#5a2a17"), P[5], .5);
    const L = 5;
    for (let i = 0; i < L; i++) {
      const t = i / (L - 1);
      const base = hor + t * H * .36 - H * .01;
      const amp = H * (.02 + t * .05), f1 = 1 + r() * 2, f2 = 2 + r() * 4, ph = r() * 9, ph2 = r() * 9;
      const yAt = px => base - amp * (Math.sin(px / W * Math.PI * f1 + ph) + .45 * Math.sin(px / W * Math.PI * f2 + ph2));
      x.beginPath(); x.moveTo(0, H);
      for (let px = 0; px <= W; px += 3) x.lineTo(px, yAt(px));
      x.lineTo(W, H); x.closePath();
      const g = x.createLinearGradient(0, base - amp * 1.5, 0, base + H * .2);
      const lit = mix(mix(sand, P[3], .35), dark, t * .35), shade = mix(sand, dark, .45 + t * .4);
      g.addColorStop(0, rgba(lit)); g.addColorStop(1, rgba(shade));
      x.fillStyle = g; x.fill();
      x.strokeStyle = rgba(mix(lit, [255, 255, 255], .35), .5); x.lineWidth = Math.max(1, W / 500);
      x.beginPath(); for (let px = 0; px <= W; px += 3) px ? x.lineTo(px, yAt(px)) : x.moveTo(px, yAt(px)); x.stroke();
      band(x, W, base - H * .02, base + H * .06, P[2], .18 * (1 - t), 0);
    }
  },
  clouds(x, W, H, r) {
    const P = pick(r, DAY);
    const hor = H * (.7 + r() * .1);
    skyGrad(x, W, hor, P[0], P[1], P[2], .55);
    const sx = W * (.2 + r() * .6), sy = hor - H * (.04 + r() * .1);
    sun(x, sx, sy, W * (.04 + r() * .03), P[3], W);
    const puff = (cx, cy, rr, c, a) => {
      const g = x.createRadialGradient(cx, cy, 0, cx, cy, rr);
      g.addColorStop(0, rgba(c, a)); g.addColorStop(.62, rgba(c, a * .85)); g.addColorStop(1, rgba(c, 0));
      x.fillStyle = g; x.beginPath(); x.arc(cx, cy, rr, 0, 7); x.fill();
    };
    const rows = 4 + Math.floor(r() * 3);
    for (let k = 0; k < rows; k++) {
      const cy = H * (.1 + (k / rows) * (hor / H - .2)) + (r() - .5) * H * .04;
      const near = Math.abs(cy - sy) / H;
      const lit = mix(P[3], P[2], Math.min(1, near * 2.2));
      const body = mix(mix(P[1], P[0], .3 + near * .4), P[5], .15);
      const n = 2 + Math.floor(r() * 3);
      for (let c = 0; c < n; c++) {
        const cx0 = r() * W, span = W * (.25 + r() * .45), sz = H * (.018 + r() * .022) * (1 - k / rows * .3);
        const blobs = [];
        for (let i = 0; i < 26; i++) { const u = r() - .5; blobs.push([cx0 + u * span, cy - Math.cos(u * Math.PI) * sz * (.6 + r() * .8), sz * (.7 + r() * .9) * (1 - Math.abs(u))]); }
        for (const [bx, by, br] of blobs) puff(bx, by + br * .35, br * 1.15, body, .55);
        for (const [bx, by, br] of blobs) puff(bx + (sx - bx) * .02, by - br * .25, br * .85, lit, .5);
      }
    }
    band(x, W, hor - H * .05, hor, P[2], 0, .35);
    ridge(x, W, H, noise(r), hor, H * .03, 2.5, false, rgba(mix(P[4], P[5], .45)));
    ridge(x, W, H, noise(r), hor + H * .07, H * .04, 2, false, rgba(mix(P[4], P[5], .8)));
  },
};
const SCENE_W = [["mountains", 3], ["lake", 2.2], ["ocean", 2.2], ["night", 2], ["aurora", 1.4], ["forest", 2], ["dunes", 1.4], ["clouds", 1.4]];
function chooseScene(r, avoid) {
  const pool = SCENE_W.filter(s => s[0] !== avoid), tot = pool.reduce((a, s) => a + s[1], 0);
  let v = r() * tot; for (const s of pool) { v -= s[1]; if (v <= 0) return s[0]; } return pool[0][0];
}
function paint(canvas, seed, scene) {
  const W = canvas.width, H = canvas.height, x = canvas.getContext("2d");
  const r = rng(seed);
  SCENES[scene](x, W, H, r);
  // vignette
  const g = x.createRadialGradient(W / 2, H * .45, H * .25, W / 2, H * .45, H * .85);
  g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,.42)");
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  // brightness behind the text decides how much scrim we need
  try {
    const sw = Math.floor(W * .7), sh = Math.floor(H * .4);
    const d = x.getImageData(Math.floor(W * .15), Math.floor(H * .28), sw, sh).data;
    let s = 0, c = 0; for (let i = 0; i < d.length; i += 4 * 97) { s += .2126 * d[i] + .7152 * d[i + 1] + .0722 * d[i + 2]; c++; }
    return s / c / 255;
  } catch { return .4; }
}

