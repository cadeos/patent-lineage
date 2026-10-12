import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../../kit/iso-kit.mjs";
import * as G from "../../kit/lathe.mjs";
import { kitScript } from "../../scripts/inline-kit.mjs";
import { sheetUri } from "../../scripts/sheet-uri.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const theme = process.argv.includes("--light") ? "light" : "dark";
const lineage = JSON.parse(readFileSync(join(HERE, "lineage.verified.json"), "utf8"));
if (lineage.ancestors.some((entry) => !entry.verified)) {
  console.error("lineage.verified.json has unverified ancestors: run scripts/verify-patents.mjs first");
  process.exit(1);
}

// A mouse is small: every specimen is drawn at the same magnification, MAG times life size.
// Geometry below is written in real millimetres; SC turns a millimetre into world units (1 unit ~ 1 cm on screen).
const MAG = 9;
const SC = MAG / 10;
const WIDTH = 960;
const HEIGHT = 250;
const STATIONS = [-282, -141, 0, 141, 282];
const FLOOR = 14;
const LINE = [-340, 340];

const P = k.fitProjection(
  [[LINE[0], 0, -8], [LINE[1], 0, -8], [LINE[0], -26, 0], [LINE[1], 26, 0], ...STATIONS.flatMap((sx) => [[sx - 56, 34, FLOOR + 50], [sx + 56, -34, FLOOR + 50], [sx - 60, 44, FLOOR], [sx + 60, -34, FLOOR]])],
  WIDTH,
  HEIGHT,
  { pad: 16, azimuth: 106, elevation: 26 },
);

const at = (point) => k.iso(point, P);
const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const D = (points, style) => k.dotsSvg(points, style);
const view = G.viewOf(P);
const light = G.lightOf(P);
const depth = (point) => G.dot3(point, view);
const { add3: add, sub3: sub, mul3: mul, unit3: unit, cross3: cross, dot3: dot } = G;
const BANDS = [0, 0.2, 0.42, 0.62];
const flatPath = (points3, closed = false) => k.pathOf(points3.map(at), closed);
let CLIP = 0;

function station(index, sx, build) {
  const items = [];
  const W = (p) => [sx + p[0] * SC, p[1] * SC, FLOOR + p[2] * SC];
  const put = (p, svg, bias = 0) => items.push({ key: depth(W(p)) + bias, svg });
  build(put, W);
  items.sort((a, b) => a.key - b.key);
  return `<g data-st="${index}">${items.map((item) => item.svg).join("")}</g>`;
}

const mut = (paths, tone = "hi", extra = {}) => S(paths, { tone, className: "mut", crease: "lo", ...extra });
const mutLine = (d, extra = {}) => k.lineSvg(d, { tone: "hi", className: "mut-line", ...extra });

// ---------------------------------------------------------------------------------------------
// A moulded shell: a superelliptic footprint with a short vertical wall and a domed top.
// Top points are addressed by (u, w) in the unit superellipse (u along x, w along y),
// wall points by (theta, z). Shading is the sphere trick from the kit: each tone is the hull of
// the visible surface points whose light score clears the band, which is exact enough for a
// convex body and costs four small polygons.
function shellOf(W, { a, b, h, wall = 0, p = 2.2, q = 2, wf = () => 1, hf = () => 1, at0 = [0, 0, 0] }) {
  const spow = (v, e) => Math.sign(v) * Math.abs(v) ** e;
  const local = (x, y, z) => W([at0[0] + x, at0[1] + y, at0[2] + z]);
  const top = (u, w) => {
    const r = Math.min(1, Math.abs(u) ** p + Math.abs(w) ** p);
    return local(a * u, b * wf(u) * w, wall + h * hf(u) * (1 - r) ** (1 / q));
  };
  const rimUW = (t) => [spow(Math.cos(t), 2 / p), spow(Math.sin(t), 2 / p)];
  const side = (t, z) => {
    const [u, w] = rimUW(t);
    return local(a * u, b * wf(u) * w, z);
  };
  const normalTop = (u, w) => {
    const e = 1e-4;
    const ru = Math.abs(u) ** p + Math.abs(w) ** p;
    if (ru > 0.995) {
      const t = Math.atan2(spow(w, p / 2), spow(u, p / 2));
      return normalSide(t);
    }
    const du = sub(top(u + e, w), top(u - e, w));
    const dw = sub(top(u, w + e), top(u, w - e));
    const n = unit(cross(du, dw));
    return n[2] < 0 ? mul(n, -1) : n;
  };
  const normalSide = (t) => {
    const e = 1e-4;
    const dt = sub(side(t + e, 0), side(t - e, 0));
    const n = unit(cross(dt, [0, 0, 1]));
    const c = side(t, 0);
    const o = local(0, 0, 0);
    return dot(n, sub(c, o)) < 0 ? mul(n, -1) : n;
  };
  const samples = [];
  const T = 160;
  for (let i = 0; i < T; i++) {
    const t = (i / T) * Math.PI * 2;
    for (const z of [0, wall * 0.5, wall]) samples.push({ p: side(t, z), n: normalSide(t) });
    for (let j = 1; j <= 30; j++) {
      const rho = Math.sin((j / 30) * (Math.PI / 2)) * 0.999;
      const [u0, w0] = rimUW(t);
      const u = u0 * rho;
      const w = w0 * rho;
      samples.push({ p: top(u, w), n: normalTop(u, w) });
    }
  }
  samples.push({ p: top(0, 0), n: [0, 0, 1] });
  const outline = k.pathOf(G.hullOf(samples.map((s) => at(s.p))), true);
  const seen = samples.filter((s) => dot(s.n, view) > 0);
  const band = (lo) => {
    const pts = seen.filter((s) => dot(s.n, light) >= lo).map((s) => at(s.p));
    return pts.length > 2 ? k.pathOf(G.hullOf(pts), true) : "";
  };
  const paths = { fill: outline, outline, crease: "", top: "", shades: [outline, band(BANDS[1]), band(BANDS[2]), band(BANDS[3])], seamless: true };
  // A curve on the top, given as (u, w) points: only the parts facing the viewer are drawn.
  const runs = (list, closed) => {
    const flags = list.map((s) => dot(s.n, view) > 0.02);
    if (flags.every(Boolean)) return k.pathOf(list.map((s) => at(s.p)), closed);
    const out = [];
    let run = [];
    list.forEach((s, i) => {
      if (flags[i]) run.push(at(s.p));
      else if (run.length) {
        out.push(run);
        run = [];
      }
    });
    if (run.length) out.push(run);
    if (closed && flags[0] && flags[flags.length - 1] && out.length > 1) out[0] = [...out.pop(), ...out[0]];
    return out.filter((r) => r.length > 1).map((r) => k.pathOf(r)).join("");
  };
  const dense = (uw, closed, n = 6) => {
    const out = [];
    const m = closed ? uw.length : uw.length - 1;
    for (let i = 0; i < m; i++) {
      const A = uw[i];
      const B = uw[(i + 1) % uw.length];
      for (let j = 0; j < n; j++) out.push([A[0] + ((B[0] - A[0]) * j) / n, A[1] + ((B[1] - A[1]) * j) / n]);
    }
    if (!closed) out.push(uw[uw.length - 1]);
    return out;
  };
  const curve = (uw, { closed = false } = {}) => runs(dense(uw, closed).map(([u, w]) => ({ p: top(u, w), n: normalTop(u, w) })), closed);
  const rimLine = (z, from = 0, to = Math.PI * 2) => {
    const list = [];
    for (let i = 0; i <= 240; i++) {
      const t = from + ((to - from) * i) / 240;
      list.push({ p: side(t, z), n: normalSide(t) });
    }
    return runs(list, false);
  };
  // a region may run over the rim and down the wall: past rho = 1 the extra radius becomes depth down the wall
  const region = (uw, down = 0.3) => dense(uw, true).map(([u, w]) => {
    const rho = (Math.abs(u) ** p + Math.abs(w) ** p) ** (1 / p);
    if (rho <= 1) return top(u, w);
    const t = Math.atan2(spow(w / rho, p / 2), spow(u / rho, p / 2));
    return side(t, Math.max(wall * 0.15, wall * (1 - (rho - 1) / down)));
  });
  const toneAt = (u, w) => G.bandOf(dot(normalTop(u, w), light));
  return { paths, top, side, normalTop, normalSide, curve, rimLine, region, toneAt, rimUW };
}

// A flat patch lying on a curved surface (a key cap seam, a touch zone): a solid with one shade.
function patchOf(points3, tone) {
  const d = flatPath(points3, true);
  const shades = ["", "", "", ""];
  shades[Math.max(0, Math.min(3, tone))] = d;
  return { fill: d, outline: d, crease: "", top: "", shades };
}

// A wobbly closed loop in (u, w): the torn edge the patent drawings use for a cut-away cover.
function torn(cu, cw, ru, rw, wobble = 0.05, n = 28, phase = 0) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const f = 1 + wobble * Math.sin(t * 5 + phase) + wobble * 0.6 * Math.sin(t * 9 + phase * 2);
    out.push([cu + ru * Math.cos(t) * f, cw + rw * Math.sin(t) * f]);
  }
  return out;
}

// A cut-away: the dark cavity, then whatever is inside, clipped to the opening, then the cut edge.
function cutaway(windowD, inside) {
  const id = `cut${CLIP++}`;
  return `<clipPath id="${id}"><path d="${windowD}"/></clipPath><g clip-path="url(#${id})"><g class="iso-solid cavity"><path class="iso-fill" d="${windowD}"/><path class="iso-shade" data-shade="0" d="${windowD}"/></g>${inside}</g>${L(windowD, { tone: "mid" })}`;
}

// Painter's order inside a cut-away (its own little station).
function inner(W) {
  const items = [];
  const put = (p, svg, bias = 0) => items.push({ key: depth(W(p)) + bias, svg });
  const svg = () => items.sort((a, b) => a.key - b.key).map((item) => item.svg).join("");
  return { put, svg };
}

const frameX = (o) => G.frameOf(o, [1, 0, 0], [0, 1, 0], [0, 0, 1]);
const frameY = (o) => G.frameOf(o, [0, 1, 0], [1, 0, 0], [0, 0, 1]);
const frameZ = (o) => G.frameOf(o, [0, 0, 1], [1, 0, 0], [0, 1, 0]);

// A cord lying on the desk: a smooth curve through mm points, with a terminal dot at each end.
function cord(W, pts, { tone = "lo", size = 0.7 } = {}) {
  const smooth = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let j = 0; j < 8; j++) {
      const t = j / 8;
      const t2 = t * t;
      const t3 = t2 * t;
      smooth.push([0, 1, 2].map((c) => 0.5 * (2 * p1[c] + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3)));
    }
  }
  smooth.push(pts[pts.length - 1]);
  const flat = smooth.map((p) => at(W(p)));
  return k.wireSvg(flat[0], flat[flat.length - 1], { via: flat.slice(1, -1), tone, size });
}

// ---------------------------------------------------------------------------------------------
// 1970 · Engelbart, US 3,541,541. Fig. 2/3: housing 26 (a rounded box, tall at the key end,
// sloping to a big round tail), keys 22 on top of the front, base 28, two wheels at right angles:
// wheel 42 (rolls sideways, shaft along the body) and wheel 52 (rolls forward, shaft across),
// each turning a potentiometer (38, 40) on brackets 30/32/36; glide 54; cord 18 from the tail.
function engelbart(put, W) {
  const sh = shellOf(W, { a: 50, b: 34, h: 36, wall: 12, p: 3.2, q: 2.6, wf: (u) => 1 - 0.06 * u, hf: (u) => 1 + 0.18 * u });
  put([0, 0, 20], S(sh.paths, { tone: "mid", inner: L(sh.rimLine(3), { tone: "faint" }) }), 0);
  // the cut-away over the inside (Fig. 3 is a section through the same place)
  const hole = sh.region(torn(-0.1, 0.5, 0.6, 0.72, 0.03, 34, 0.7), 0.3);
  const holeD = flatPath(hole, true);
  const I = inner(W);
  I.put([0, 0, 1], S(k.slabOf({ x: W([-46, 0, 0])[0], y: -30 * SC, w: 92 * SC, d: 60 * SC, r: 8 * SC }, FLOOR, 3 * SC, P, 6, 0.4), { tone: "lo" }), -40);
  // bracket 36 along the body and bracket 32 across it
  I.put([-4, 6, 6], S(k.slabOf({ x: W([-30, 0, 0])[0], y: 4 * SC, w: 44 * SC, d: 3 * SC, r: 0.3 }, FLOOR + 3 * SC, 18 * SC, P, 2), { tone: "lo" }), -20);
  I.put([24, 0, 6], S(k.slabOf({ x: W([22, 0, 0])[0], y: -18 * SC, w: 3 * SC, d: 30 * SC, r: 0.3 }, FLOOR + 3 * SC, 30 * SC, P, 2), { tone: "lo" }), -18);
  // potentiometer 38 (on wheel 42's shaft 44, along x) and 40 (on wheel 52's shaft 48, along y)
  const pot38 = frameX(W([8, -2, 21]));
  I.put([12, -2, 21], S(G.disc(0, 12 * SC, 8 * SC, pot38, P), { tone: "mid", inner: L(G.arcOf(pot38, 6 * SC, 8 * SC, P), { tone: "faint" }) }), -6);
  const pot40 = frameY(W([-10, -6, 30]));
  I.put([-10, -2, 30], S(G.disc(0, 9 * SC, 8 * SC, pot40, P), { tone: "mid" }), -4);
  I.put([-10, 3, 30], S(G.disc(9 * SC, 11 * SC, 2 * SC, pot40, P), { tone: "lo" }), -3.9);
  // wheel 42: plane across the body, shaft along x, near the keys
  const w42 = frameX(W([36, 0, 19]));
  I.put([37, 0, 19], mut(G.disc(-1.5 * SC, 1.5 * SC, 21 * SC, w42, P), "hi", { inner: L(G.circleOf(w42, 1.5 * SC, 6 * SC, P), { tone: "faint" }) }), 2);
  I.put([30, 0, 19], S(G.disc(-1.5 * SC - 8 * SC, -1.5 * SC, 1.6 * SC, w42, P), { tone: "lo" }), 1);
  // wheel 52: plane along the body, shaft along y, on the near side
  const w52 = frameY(W([-10, 18, 19]));
  I.put([-10, 19, 19], mut(G.disc(-1.5 * SC, 1.5 * SC, 21 * SC, w52, P), "hi", { inner: L(G.circleOf(w52, 1.5 * SC, 6 * SC, P), { tone: "faint" }) }), 4);
  I.put([-10, 10, 19], S(G.disc(-9 * SC, -1.5 * SC, 1.6 * SC, w52, P), { tone: "lo" }), 3);
  put([0, 0, 40], cutaway(holeD, I.svg()), 30);
  // three keys 22 across the front of the top
  for (const w of [-0.34, 0, 0.34]) {
    const u = 0.72;
    const base = sh.top(u, w);
    const F = G.frameAlong(base, sh.normalTop(u, w));
    put([36, w * 34, 46], S(G.disc(-1 * SC, 3 * SC, 4.6 * SC, F, P), { tone: "hi" }), 40 + w);
  }
  put([-50, 0, 0], cord(W, [[-50, 4, 0], [-62, 6, 0], [-72, -2, 0], [-82, -10, 0], [-88, -6, 0]]), -10);
}

// 1974 · Rider (Xerox), US 3,835,464. Fig. 2: hemispherical housing 22 on base 18, ball 8
// through the base, idler 24 under plate 20, pick-off wheels 26 and 28 on hangers 31 and 33,
// key 14 on top, feet 36 and 38, cord 9.
function rider(put, W) {
  const R = 38;
  const sh = shellOf(W, { a: R, b: R, h: R - 3, wall: 3, p: 2, q: 2 });
  put([0, 0, 18], S(sh.paths, { tone: "mid", inner: L(sh.rimLine(3), { tone: "faint" }) }), 0);
  const hole = sh.region(torn(-0.06, 0.62, 0.52, 0.5, 0.035, 30, 1.9), 0.12);
  const holeD = flatPath(hole, true);
  const I = inner(W);
  I.put([0, 0, 1], S(G.disc(0, 3 * SC, (R - 2) * SC, frameZ(W([0, 0, 0])), P), { tone: "lo" }), -60);
  const ball = W([0, 0, 7]);
  I.put([0, 0, 7], mut(G.sphereOf(ball, 12 * SC, P), "hi"), 0);
  // plate 20 (a bar along x) and hangers 31, 33 down to the pick-off wheels
  I.put([0, 0, 22], S(k.slabOf({ x: W([-22, 0, 0])[0], y: -5 * SC, w: 44 * SC, d: 10 * SC, r: 0.4 }, FLOOR + 20 * SC, 2 * SC, P, 2), { tone: "lo" }), 6);
  for (const x of [-17, 17]) {
    I.put([x, 0, 14], S(k.slabOf({ x: W([x - 1, 0, 0])[0], y: -3 * SC, w: 2 * SC, d: 6 * SC, r: 0.2 }, FLOOR + 6 * SC, 14 * SC, P, 2), { tone: "lo" }), x > 0 ? -2 : 2);
    const F = frameY(W([x, -3.5, 6]));
    I.put([x, 2, 6], S(G.disc(0, 7 * SC, 4.6 * SC, F, P), { tone: "mid", inner: L(G.circleOf(F, 7 * SC, 1.4 * SC, P), { tone: "faint" }) }), x > 0 ? -1 : 1.5);
  }
  // idler 24 riding on top of the ball
  const F24 = frameY(W([0, -3, 21.6]));
  I.put([0, 0, 21.6], S(G.disc(0, 6 * SC, 2.2 * SC, F24, P), { tone: "mid" }), 7);
  put([0, 0, 30], cutaway(holeD, I.svg()), 30);
  // key 14 on top
  const top = sh.top(0, 0);
  put([0, 0, 38], S(G.disc(0, 3 * SC, 1.6 * SC, frameZ(top), P), { tone: "mid" }), 40);
  put([0, 0, 41], S(G.solidOf([[3 * SC, 0], [3 * SC, 3.6 * SC], [5 * SC, 3.4 * SC, 1], [6.6 * SC, 2 * SC, 1], [7.2 * SC, 0]], frameZ(top), P), { tone: "hi" }), 41);
  put([-38, 0, 0], cord(W, [[-37, 6, 0], [-50, 10, 0], [-62, 4, 0], [-72, -6, 0], [-80, -4, 0]]), -10);
}

// 1983 · Kirsch, US 4,390,873. Fig. 1/2: a small box housing 14 (cover cut away in Fig. 1),
// light source 17 with its lamp and detector 21 with its photocell 25, both slanted down to the
// spot 23 on the gridded surface 13; mounting wall 27, bottom rim 31/33; wires out of both ends.
function kirsch(put, W) {
  const LEN = 72;
  const WID = 46;
  const H = 28;
  const box = { x: W([-LEN / 2, 0, 0])[0], y: (-WID / 2) * SC, w: LEN * SC, d: WID * SC, r: 4 * SC };
  put([0, 0, 12], S(k.slabOf(box, FLOOR, (H - 2) * SC, P, 4, 0.4), { tone: "mid", inner: L(k.sideSeam(box, FLOOR + 3 * SC, P, 4), { tone: "faint" }) }), 0);
  const lid = k.insetPlan(box, -0.8 * SC);
  put([0, 0, H], S(k.slabOf(lid, FLOOR + (H - 2) * SC, 2 * SC, P, 4, 0.4), { tone: "mid" }), 1);
  const zt = FLOOR + H * SC;
  // the cut takes the cover and the near wall, as a section would: a torn line over the top, down the wall
  const yN = WID / 2 + 0.6;
  const hole = [];
  const wob = (t, ph) => 1.2 * Math.sin(t * 7 + ph) + 0.7 * Math.sin(t * 13 + ph * 2);
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    const x = -LEN / 2 + 8 + (LEN - 16) * t;
    hole.push(W([x, -WID / 2 + 9 + wob(t, 0.4), H]));
  }
  for (let i = 0; i <= 8; i++) hole.push(W([LEN / 2 - 8 + wob(i / 8, 1) * 0.6, -WID / 2 + 9 + (WID - 9) * (i / 8), H]));
  for (let i = 0; i <= 8; i++) hole.push(W([LEN / 2 - 8 + wob(i / 8, 2) * 0.6, yN, H - (H - 7) * (i / 8)]));
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    hole.push(W([LEN / 2 - 8 - (LEN - 16) * t, yN, 7 + wob(t, 2.2) * 0.8]));
  }
  for (let i = 0; i <= 8; i++) hole.push(W([-LEN / 2 + 8 + wob(i / 8, 3) * 0.6, yN, 7 + (H - 7) * (i / 8)]));
  for (let i = 1; i < 8; i++) hole.push(W([-LEN / 2 + 8 + wob(i / 8, 4) * 0.6, yN - (WID - 9) * (i / 8), H]));
  const holeD = flatPath(hole, true);
  const I = inner(W);
  I.put([0, 0, 0], S(k.slabOf(k.insetPlan(box, 2 * SC), FLOOR, 2 * SC, P, 4), { tone: "lo" }), -60);
  // wall 27: a shelf across the middle that the two tubes pass through
  I.put([0, -12, 12], S(k.slabOf({ x: W([-LEN / 2 + 2, 0, 0])[0], y: (-WID / 2 + 2) * SC, w: (LEN - 4) * SC, d: (WID / 2 - 8) * SC, r: 1 * SC }, FLOOR + 10 * SC, 4 * SC, P, 3), { tone: "lo" }), -30);
  // the two slanted tubes: light source 17 (lamp at its top end) and detector 21 (photocell 25)
  const tube = (sign, label) => {
    const tip = W([sign * 2.5, 0, 1.5]);
    const dir = unit([sign, 0, 1]);
    const F = G.frameAlong(tip, dir);
    const body = G.solidOf([[0, 0.8 * SC], [9 * SC, 5.4 * SC], [11 * SC, 6 * SC], [34 * SC, 6 * SC], [34 * SC, 4 * SC]], F, P);
    I.put([sign * 14, 0, 13], mut(body, "hi", { inner: L(G.arcOf(F, 11 * SC, 6 * SC, P), { tone: "faint" }) + L(G.arcOf(F, 26 * SC, 6 * SC, P), { tone: "faint" }) }), 10 + sign);
    const cap = G.frameAlong(G.pointOf(F, 34 * SC, 0, 0), dir);
    I.put([sign * 26, 0, 25], S(G.disc(0, 3 * SC, 3.4 * SC, cap, P), { tone: "mid", inner: L(G.circleOf(cap, 3 * SC, 1.6 * SC, P), { tone: "faint" }) }), 12 + sign);
    return label;
  };
  tube(-1, "17");
  tube(1, "21");
  // the spot 23 where both look
  I.put([0, 0, 0], `<g class="mut-dots">${D([at(W([0, 0, 1.2]))], { size: 1.1, tone: "lo" })}</g>`, 30);
  put([0, 0, 30], cutaway(holeD, I.svg()), 30);
  // two pairs of wires, out through the end walls under the cover (Fig. 2)
  put([-LEN / 2, 0, 20], cord(W, [[-LEN / 2 - 0.4, -4, 24], [-44, -6, 22], [-52, -4, 12], [-58, 2, 2], [-70, 8, 0]]) + cord(W, [[-LEN / 2 - 0.4, 2, 24], [-44, 3, 22], [-51, 6, 12], [-56, 12, 2], [-66, 18, 0]]), -10);
  put([LEN / 2, 0, 20], cord(W, [[LEN / 2 + 0.4, -4, 24], [44, -6, 22], [52, -8, 12], [58, -14, 2], [68, -20, 0]]) + cord(W, [[LEN / 2 + 0.4, 2, 24], [44, 2, 22], [53, 0, 12], [60, -4, 2], [72, -8, 0]]), -60);
}

// 1996 · Gillick, US 5,530,455. Fig. 1: body 10 with top 26, keys 18 and 22 either side of the
// centre piece 20, roller 24 standing up between them at the front, side slot 25, cord at the front.
// Fig. 5: roller 24 on axle 36 in frame 30, over switch 35/37, on springs 29 in cup 31.
function gillick(put, W) {
  const sh = shellOf(W, { a: 58, b: 31, h: 26, wall: 12, p: 2.5, q: 2.2, wf: (u) => 1 + 0.06 * u, hf: (u) => (u > 0 ? 1 - 0.32 * u * u : 1 - 0.08 * u * u) });
  const split = sh.rimLine(12, 0, Math.PI * 2);
  put([0, 0, 18], S(sh.paths, { tone: "mid", inner: L(split, { tone: "faint" }) }), 0);
  // keys 18 and 22: a seam across the top and two seams down the front, either side of piece 20
  const seams = [];
  seams.push(sh.curve([[0.42, -0.98], [0.44, -0.5], [0.44, 0.5], [0.42, 0.98]]));
  for (const w of [-0.24, 0.24]) seams.push(sh.curve([[0.44, w], [0.7, w], [0.995, w]]));
  // the ridge of piece 20 running back along the top (the long rounded loop in Fig. 1)
  seams.push(sh.curve(torn(0.06, 0, 0.36, 0.1, 0, 36), { closed: true }));
  put([0, 0, 40], L(seams.join(""), { tone: "lo" }), 20);
  // side slot 25 on the near wall
  const slot = [];
  for (let i = 0; i <= 40; i++) {
    const t = Math.PI * (0.33 + (0.17 * i) / 40);
    slot.push(sh.side(t, 5.6 + 2.2 * Math.sin((i / 40) * Math.PI) * 0.0));
  }
  const slotBack = [];
  for (let i = 40; i >= 0; i--) slotBack.push(sh.side(Math.PI * (0.33 + (0.17 * i) / 40), 8.2));
  put([10, 30, 6], `<path class="iso-shade" data-shade="0" d="${flatPath([...slot, ...slotBack], true)}"/>` + L(flatPath([...slot, ...slotBack], true), { tone: "lo" }), 22);
  // roller 24 in its slot, shaft across the body
  const ru = 0.7;
  const slotD = flatPath(sh.region([[ru - 0.13, -0.17], [ru + 0.13, -0.17], [ru + 0.13, 0.17], [ru - 0.13, 0.17]]), true);
  put([40, 0, 34], `<path class="iso-shade" data-shade="0" d="${slotD}"/>` + L(slotD, { tone: "lo" }), 24);
  const c = sh.top(ru, 0);
  const F = frameY(add(c, [0, -4.4 * SC, -5 * SC]));
  put([40, 0, 36], mut(G.solidOf([[0, 0], [0, 7.2 * SC], [1.2 * SC, 8.1 * SC, 1], [4.4 * SC, 8.5 * SC, 1], [7.6 * SC, 8.1 * SC, 1], [8.8 * SC, 7.2 * SC], [8.8 * SC, 0]], F, P), "hi", { inner: k.fadedSvg(G.ribsOf(F, 1.4 * SC, 7.4 * SC, 8.4 * SC, 26, P, { fade: [0.05, 0.4] }), { tone: "faint" }) }), 26);
  put([58, 0, 0], cord(W, [[57.6, 0, 6], [66, 1, 3], [74, 8, 0], [80, 18, 0], [84, 24, 0]]), -40);
}

// 2010 · Hotelling (Apple), US 7,808,479. Fig. 1: mouse 20, a smooth egg of housing 22 with
// top member 26 over base 24 and no keys at all: touch-sensitive zones 28A and 28B under the
// front of the top and 28C on the side read where the fingers rest (sensor nodes 188, front page).
function hotelling(put, W) {
  const sh = shellOf(W, { a: 56, b: 30, h: 28, wall: 6, p: 2.15, q: 2.1, wf: (u) => 1 - 0.14 * u, hf: (u) => 1 - 0.16 * u - 0.12 * u * u });
  put([0, 0, 18], S(sh.paths, { tone: "mid", inner: L(sh.rimLine(4.2) + sh.rimLine(6), { tone: "faint" }) }), 0);
  const zones = [
    { uw: torn(0.56, 0.4, 0.3, 0.3, 0.02, 30, 0.2), bias: 22 },
    { uw: torn(0.56, -0.4, 0.3, 0.3, 0.02, 30, 1.2), bias: 21 },
    { uw: torn(-0.12, 0.86, 0.3, 0.1, 0.0, 30, 0), bias: 23 },
  ];
  for (const z of zones) {
    const cu = z.uw.reduce((s, p) => s + p[0], 0) / z.uw.length;
    const cw = z.uw.reduce((s, p) => s + p[1], 0) / z.uw.length;
    const pts = sh.region(z.uw);
    const visible = dot(sh.normalTop(cu, cw), view) > 0.05;
    if (!visible) continue;
    put([cu * 56, cw * 30, 30], mut(patchOf(pts, sh.toneAt(cu, cw)), "hi", { crease: "none" }), z.bias);
    // the sensor nodes under the zone, on a grid that follows the surface
    const nodes = [];
    for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) {
      const du = (i / 3.4) * (z.uw === zones[2].uw ? 0.27 : 0.25);
      const dw = (j / 3.4) * (z.uw === zones[2].uw ? 0.08 : 0.25);
      if ((du / 0.3) ** 2 + (dw / (z.uw === zones[2].uw ? 0.1 : 0.3)) ** 2 > 0.72) continue;
      const u = cu + du;
      const w = cw + dw;
      if (dot(sh.normalTop(u, w), view) < 0.1) continue;
      nodes.push(at(sh.top(u, w)));
    }
    put([cu * 56, cw * 30, 31], `<g class="mut-dots">${D(nodes, { size: 0.42, tone: "lo" })}</g>`, z.bias + 0.5);
  }
}

const BUILDS = [engelbart, rider, kirsch, gillick, hotelling];

function timeline() {
  const out = [k.wireSvg(at([LINE[0], 0, 0]), at([LINE[1], 0, 0]), { tone: "lo", size: 0.9 })];
  STATIONS.forEach((sx, index) => {
    const [x, y] = at([sx, 0, 0]);
    out.push(`<circle class="origin-tick" data-tick="${index}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2"/>`);
    out.push(`<text class="origin-year" data-year="${index}" x="${x.toFixed(1)}" y="${(y + 15).toFixed(1)}" text-anchor="middle">${lineage.ancestors[index].year}</text>`);
  });
  return out.join("");
}

const marker = () => {
  const [x, y] = at([0, 0, 0]);
  return `<g data-part="marker" transform="${k.translateAlong(P, [STATIONS[0], 0, 0])}"><circle class="origin-marker" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.6"/></g>`;
};

const order = STATIONS.map((sx, index) => ({ sx, index })).sort((a, b) => k.depthOf([a.sx, 0, 0], P) - k.depthOf([b.sx, 0, 0], P));
const specimens = order.map(({ sx, index }) => station(index, sx, BUILDS[index])).join("");

const svg = k.figureSvg({
  width: WIDTH,
  height: HEIGHT,
  label: `${lineage.title}: five patented ancestors of the computer mouse float in a row above a timeline, each redrawn from its patent drawing at ${MAG} times life size. ${lineage.ancestors.map((a) => `${a.year}, ${a.name} (${a.id}): ${a.trait}.`).join(" ")}`,
  body: [timeline(), marker(), specimens],
});

const SHEETS = lineage.ancestors.map((a) => sheetUri(HERE, a.sheet && a.sheet.file));
const data = lineage.ancestors.map((a) => ({ id: a.id, year: a.year, name: a.name, short: a.short, trait: a.trait, url: a.url, sheet: "", sheetUrl: a.sheet ? a.sheet.url : "", inventor: a.inventor, number: a.id.replace(/^US0*/, "US ").replace(/^(US \d+?)[A-Z]\d?$/, "$1").replace(/(\d)(?=(\d{3})+(?!\d))/g, "$1,") }));
const readoutOf = (a) => `${a.year} · ${a.inventor} · ${a.number} · ${a.short}`;

const live = `
const P = ${JSON.stringify(P)};
const STATIONS = [-282, -141, 0, 141, 282];
const DATA = ${JSON.stringify(data)};
const stage = document.querySelector(".iso-stage");
const svg = stage.querySelector("svg");
const rider = svg.querySelector('[data-part="marker"]');
const ticks = [...svg.querySelectorAll("[data-tick]")];
const years = [...svg.querySelectorAll("[data-year]")];
const readout = document.querySelector("[data-readout]");
const sheet = document.querySelector("[data-sheet]");
const galleryImgs = [...document.querySelectorAll(".origin-gallery img")];
const still = matchMedia("(prefers-reduced-motion: reduce)");
const groups = [...svg.querySelectorAll("[data-st]")].sort((a, b) => a.dataset.st - b.dataset.st);
let chosen = -1, target = 0, x = STATIONS[0], frame = 0, last = 0, clock = 0, touring = !still.matches, visible = false, idle = 0;
function light(index) {
  groups.forEach((group, i) => {
    const on = i === index;
    group.querySelectorAll(".iso-solid.mut").forEach((solid) => {
      solid.toggleAttribute("data-lit", on);
      const edge = solid.querySelector(".iso-edge");
      if (edge) edge.setAttribute("data-tone", on ? "lit" : "hi");
    });
    group.querySelectorAll(".mut-line").forEach((line) => line.setAttribute("data-tone", on ? "lit" : "lo"));
    group.querySelectorAll(".mut-dots .iso-dots").forEach((dots) => { dots.setAttribute("data-tone", on ? "lit" : "lo"); dots.querySelectorAll("circle").forEach((c) => c.toggleAttribute("data-pulse", on)); });
    group.style.opacity = on ? "1" : "0.86";
    ticks[i].toggleAttribute("data-on", on);
    years[i].toggleAttribute("data-on", on);
  });
  const a = DATA[index];
  const text = a.year + " · " + a.inventor + " · " + a.number + " · " + a.short;
  if (readout.textContent !== text) readout.textContent = text;
  stage.setAttribute("aria-valuenow", String(index + 1));
  stage.setAttribute("aria-valuetext", a.year + ", " + a.name + ", " + a.number + ": " + a.trait);
  if (sheet) {
    sheet.querySelector("img").src = galleryImgs[index].src;
    sheet.querySelector("img").alt = "Original drawing sheet of " + a.number;
    sheet.querySelector("[data-sheet-title]").textContent = a.name + " · " + a.year;
    sheet.querySelector("[data-sheet-trait]").textContent = a.trait + ".";
    const link = sheet.querySelector("a");
    link.href = a.url;
    link.textContent = a.number + " on Google Patents";
  }
}
function choose(index) {
  if (index === chosen) return;
  chosen = index;
  target = STATIONS[index];
  light(index);
  run();
}
function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
  last = now;
  if (touring) { clock += dt; const next = Math.floor(clock / 3.2) % STATIONS.length; if (next !== chosen) choose(next); }
  x = still.matches ? target : x + (target - x) * (1 - Math.exp(-dt / 0.32));
  if (Math.abs(target - x) < 0.05) x = target;
  rider.setAttribute("transform", translateAlong(P, [x, 0, 0]));
  frame = visible && (touring || x !== target) ? requestAnimationFrame(tick) : 0;
}
function run() { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } }
function steer(index) {
  touring = false;
  choose(Math.max(0, Math.min(STATIONS.length - 1, index)));
  clearTimeout(idle);
  idle = setTimeout(() => { touring = !still.matches; clock = chosen * 3.2 + 0.01; run(); }, 6000);
}
const screenX = STATIONS.map((sx) => iso([sx, 0, 0], P)[0]);
stage.addEventListener("pointermove", (event) => {
  const box = svg.getBoundingClientRect();
  const vx = ((event.clientX - box.left) / box.width) * ${WIDTH};
  let best = 0;
  screenX.forEach((sx, i) => { if (Math.abs(sx - vx) < Math.abs(screenX[best] - vx)) best = i; });
  steer(best);
});
stage.addEventListener("click", () => { const a = DATA[chosen]; if (a) window.open(a.url, "_blank", "noopener"); });
stage.addEventListener("keydown", (event) => {
  let to = null;
  if (event.key === "ArrowRight" || event.key === "ArrowUp") to = chosen + 1;
  if (event.key === "ArrowLeft" || event.key === "ArrowDown") to = chosen - 1;
  if (event.key === "Home") to = 0;
  if (event.key === "End") to = STATIONS.length - 1;
  if (event.key === "Enter") { const a = DATA[chosen]; if (a) window.open(a.url, "_blank", "noopener"); return; }
  if (to === null) return;
  event.preventDefault();
  steer(to);
});
new IntersectionObserver((entries) => { visible = entries[entries.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
if (sheet) sheet.querySelector("img").addEventListener("click", () => sheet.classList.toggle("big"));

const slug = document.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
function figureMarkup() {
  const clone = svg.cloneNode(true);
  const box = svg.viewBox.baseVal;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", box.width);
  clone.setAttribute("height", box.height);
  clone.classList.add("iso");
  clone.setAttribute("data-theme", document.body.dataset.theme || "dark");
  const style = document.createElement("style");
  style.textContent = [...document.querySelectorAll("style")].map((s) => s.textContent).join("\\n");
  const ground = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  ground.setAttribute("width", box.width);
  ground.setAttribute("height", box.height);
  ground.setAttribute("style", "fill:var(--anatomy-card)");
  const heading = document.createElementNS("http://www.w3.org/2000/svg", "text");
  heading.textContent = document.querySelector('[data-corner="title"]').textContent;
  heading.setAttribute("x", 28);
  heading.setAttribute("y", 36);
  heading.setAttribute("style", "font:500 13px var(--anatomy-mono);letter-spacing:.1em;text-transform:uppercase;fill:var(--anatomy-text)");
  clone.appendChild(heading);
  clone.insertBefore(ground, clone.firstChild);
  clone.insertBefore(style, clone.firstChild);
  return new XMLSerializer().serializeToString(clone);
}
function save(blob, name) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 4000);
}
function exportFigure(kind) {
  const name = slug + "-" + (document.body.dataset.theme || "dark");
  const markup = figureMarkup();
  if (kind === "svg") { save(new Blob([markup], { type: "image/svg+xml" }), name + ".svg"); return; }
  const box = svg.viewBox.baseVal, scale = 3;
  const image = new Image();
  image.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = box.width * scale;
    canvas.height = box.height * scale;
    canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => save(blob, name + ".png"), "image/png");
  };
  image.src = URL.createObjectURL(new Blob([markup], { type: "image/svg+xml" }));
}
window.figureMarkup = figureMarkup;
document.querySelectorAll("[data-export]").forEach((button) => button.addEventListener("click", (event) => { event.stopPropagation(); exportFigure(button.dataset.export); }));
choose(0);
`;

const SHEET_CSS = `
.cavity{--anatomy-paper:var(--anatomy-shade-0)}
.origin-sheet{display:grid;grid-template-columns:230px 1fr;gap:18px;align-items:center;margin:14px auto 0;max-width:var(--page-width,960px);padding:14px 16px;border-radius:14px;background:var(--anatomy-card);box-shadow:var(--anatomy-lift);color:var(--anatomy-text);font:13px/1.5 var(--anatomy-mono)}
.origin-sheet img{width:230px;height:auto;border-radius:6px;background:#fff;display:block;cursor:zoom-in}
.origin-sheet.big{grid-template-columns:1fr}.origin-sheet.big img{width:100%;max-width:720px;margin:0 auto;cursor:zoom-out}
.origin-sheet strong{color:var(--anatomy-strong);font-weight:500;display:block;margin-bottom:4px}
.origin-sheet a{color:var(--anatomy-strong)}
.origin-tick{fill:var(--anatomy-card);stroke:var(--anatomy-mid);stroke-width:.8px}
.origin-tick[data-on]{stroke:var(--anatomy-lit)}
.origin-marker{fill:var(--anatomy-lit);stroke:none}
.origin-year{font:500 9px var(--anatomy-mono);fill:var(--anatomy-muted);letter-spacing:.06em;transition:fill .4s var(--anatomy-ease)}
.origin-year[data-on]{fill:var(--anatomy-strong)}
.origin-tools{position:absolute;top:18px;left:70px;display:flex;gap:12px;z-index:2}.origin-tools button{all:unset;cursor:pointer;font:10.5px/1 var(--anatomy-mono);letter-spacing:.04em;color:var(--anatomy-muted)}.origin-tools button:hover,.origin-tools button:focus-visible{color:var(--anatomy-strong);text-decoration:underline}
.origin-gallery{display:flex;flex-wrap:wrap;gap:12px;justify-content:center;max-width:960px;margin:14px auto 0}.origin-gallery figure{margin:0;width:170px}.origin-gallery img{width:100%;height:auto;border-radius:6px;background:#fff;display:block}.origin-gallery figcaption{font:11px/1.6 var(--anatomy-mono);color:var(--anatomy-muted);text-align:center;margin-top:4px}
.origin-sources{max-width:960px;margin:14px auto 0;color:var(--anatomy-muted);font:12px/1.6 var(--anatomy-mono)}
.origin-sources a{color:var(--anatomy-text)}
@media (max-width:520px){.origin-sheet{grid-template-columns:120px 1fr}.origin-sheet img{width:120px}}
`;

const first = data[0];
const sheetHtml = `<aside class="origin-sheet" data-sheet><img src="${SHEETS[0]}" alt="Original drawing sheet of ${first.number}"><div><strong data-sheet-title>${first.name} · ${first.year}</strong><span data-sheet-trait>${first.trait}.</span><br><small>Click the drawing to enlarge it.</small><br><a href="${first.url}" target="_blank" rel="noopener">${first.number} on Google Patents</a></div></aside>`;
const gallery = `<div class="origin-gallery">${data.map((a, i) => `<figure><img src="${SHEETS[i]}" alt="Original drawing sheet of ${a.number}"><figcaption>${a.year} · ${a.number}</figcaption></figure>`).join("")}</div>`;
const sources = `<p class="origin-sources">Patents checked against Google Patents on ${lineage.checked.slice(0, 10)}: ${data.map((a) => `<a href="${a.url}" target="_blank" rel="noopener">${a.number}</a> (${a.year}, ${a.inventor})`).join(" · ")}. Each figure is redrawn from sheet 1 of its patent; a patent marks the first filing of a trait, not necessarily its first invention.</p>`;

const body = k.plateHtml({
  fig: "Fig 1",
  title: lineage.title,
  hint: "Hover a specimen · ← → · click for the patent",
  readout: readoutOf(data[0]),
  keys: [
    { mark: "lit", label: "The trait this ancestor added: what the patent first claimed" },
    { mark: "raised", label: "Everything it inherited from the one before" },
  ],
  caption: `${lineage.question} Five verified US patents, 1970 to 2010, all drawn at the same scale, ${MAG} times life size: two wheels at right angles (Engelbart), one ball instead (Rider, Xerox), a lamp and a photocell that read the desk (Kirsch), a roller between the keys (Gillick) and keys that are only touch zones under a smooth shell (Hotelling, Apple). Cut-away openings show the parts that live inside. The box gets rounder, smaller, then longer, and the keys sink into the skin.`,
  body: `<div class="origin-tools"><button type="button" data-export="png" title="Download as PNG">↓ png</button><button type="button" data-export="svg" title="Download as SVG">↓ svg</button></div><div class="iso-stage" tabindex="0" role="slider" aria-label="${lineage.title}: arrow keys walk from ancestor to ancestor" aria-valuemin="1" aria-valuemax="${data.length}" aria-valuenow="1">${svg}</div>`,
});

const name = theme === "light" ? "computer-mouse-light.html" : "computer-mouse.html";
const page = k.pageHtml({ title: lineage.title, theme, body: body + sheetHtml + gallery + sources, script: kitScript() + live, width: 1000 }).replace("</style>", `${SHEET_CSS}</style>`);
writeFileSync(join(HERE, name), page);
console.log("wrote", name);
