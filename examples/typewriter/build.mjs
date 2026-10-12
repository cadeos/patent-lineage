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

const WIDTH = 960;
const HEIGHT = 300;
const GAP = 92;
const STATIONS = lineage.ancestors.map((_, i, all) => (i - (all.length - 1) / 2) * GAP);
const FLOOR = 18;
const LINE = [STATIONS[0] - 52, STATIONS[STATIONS.length - 1] + 52];

const P = k.fitProjection(
  [[LINE[0], 0, -10], [LINE[1], 0, -10], [LINE[0], -24, 0], [LINE[1], 24, 0], [STATIONS[0] - 26, -26, FLOOR + 22], [STATIONS[0] + 27, 27, FLOOR], [STATIONS[1] - 15, -19, FLOOR + 37], [STATIONS[2] + 10, 0, FLOOR + 40], [STATIONS[3] - 10, -26, FLOOR + 22], [STATIONS[3] + 10, 26, FLOOR]],
  WIDTH,
  HEIGHT,
  { pad: 18, azimuth: 106, elevation: 24 },
);

const at = (point) => k.iso(point, P);
const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const D = (points, style) => k.dotsSvg(points, style);
const view = G.viewOf(P);
const depth = (point) => G.dot3(point, view);
const across = G.unit3([-view[1], view[0], 0]);
const unit = G.unit3;
const add = G.add3;
const mul = G.mul3;

function rod(a, b, r, P_ = P, options = {}) {
  const axis = G.sub3(b, a);
  return G.disc(0, G.len3(axis), r, G.frameAlong(a, axis), P_, options);
}
function wheel(c, r, w) {
  return G.disc(0, w, r, G.frameOf([c[0], c[1] - w / 2, c[2]], [0, 1, 0], [1, 0, 0], [0, 0, 1]), P);
}
const wheelFrame = (c, w) => G.frameOf([c[0], c[1] - w / 2, c[2]], [0, 1, 0], [1, 0, 0], [0, 0, 1]);

function station(index, sx, build) {
  const items = [];
  const put = (point, svg, bias = 0) => items.push({ key: depth([sx + point[0], point[1], point[2]]) + bias, svg });
  const W = (p) => [sx + p[0], p[1], p[2]];
  build(put, W);
  items.sort((a, b) => a.key - b.key);
  return `<g data-st="${index}">${items.map((item) => item.svg).join("")}</g>`;
}

const mut = (paths, tone = "hi", extra = {}) => S(paths, { tone, className: "mut", crease: "lo", ...extra });
const mutLine = (d, extra = {}) => k.lineSvg(d, { tone: "hi", className: "mut-line", ...extra });

// Station-local helpers. A station's local x is the machine's front (+x), y its width, z height above FLOOR.
function kitFor(W) {
  const plan = (x0, x1, y0, y1, r = 0.3) => ({ x: W([x0, 0, 0])[0], y: y0, w: x1 - x0, d: y1 - y0, r });
  const box = (x0, x1, y0, y1, z0, z1, { r = 0.3, steps = 2, bevel = 0 } = {}) => k.slabOf(plan(x0, x1, y0, y1, r), FLOOR + z0, z1 - z0, P, steps, bevel);
  const at3 = (x, y, z) => W([x, y, FLOOR + z]);
  const yFrame = (x, y0, z) => G.frameOf(at3(x, y0, z), [0, 1, 0], [1, 0, 0], [0, 0, 1]);
  const zFrame = (x, y, z) => G.frameOf(at3(x, y, z), [0, 0, 1], [1, 0, 0], [0, 1, 0]);
  const yCyl = (x, z, y0, y1, r, options) => G.disc(0, y1 - y0, r, yFrame(x, y0, z), P, options);
  const bar = (a, b, r) => rod(at3(...a), at3(...b), r);
  const ball = (p, r) => G.sphereOf(at3(...p), r, P);
  const top = (points, z, closed = false) => k.onTop(points.map(([x, y]) => [W([x, 0, 0])[0], y]), FLOOR + z, P, closed);
  return { plan, box, at3, yFrame, zFrame, yCyl, bar, ball, top };
}

// 1868 · Sholes, Glidden & Soule, US 79,265, sheet 1 Fig. 1 (perspective) and sheet 2 Fig. 7 (section).
// Case A about two feet square, keys L in a trough at the front, annular disk B with type-bars o in the cover,
// anvil O' and platen G hung from arm D, carriage frames C (C', C²) and E (E', E²), bar F with pins e.
function sholes(put, W) {
  const { plan, box, zFrame, yCyl, bar, ball, top } = kitFor(W);
  const caseA = plan(-26, 18, -26, 26, 0.8);
  put([-4, 0, 6], S(k.slabOf(caseA, FLOOR, 12, P, 3, 0.4), { tone: "mid", inner: L(k.sideSeam(caseA, FLOOR + 10.2, P, 3), { tone: "faint" }) }), -30);
  put([22, 0, 3], S(box(18, 27, -22, 22, 0, 6.2), { tone: "lo" }), -12);
  for (const y of [-1, 1]) put([22.5, y * 24, 6], S(box(18, 27, y > 0 ? 22 : -26, y > 0 ? 26 : -22, 0, 12, { r: 0.6, steps: 3 }), { tone: "mid" }), y > 0 ? 6 : -14);
  for (let i = 0; i < 15; i++) {
    const y = -19.6 + i * 2.8;
    put([22.6, y, 7], S(box(18.4, 26.6, y - 1.15, y + 1.15, 6.2, 7.6, { r: 0.5, steps: 3 }), { tone: "hi" }), -8);
  }
  const DF = zFrame(-4, 0, 12);
  put([-4, 0, 12.6], mut(G.ringBand(0, 1.4, 3, 9.4, DF, P)), 1);
  put([-4, 0, 13.4], mutLine(G.circleOf(DF, 1.4, 3, P) + G.spokesOf(DF, 1.4, 3, 9.4, 18, P, { phase: 0.17 })) + D(G.dotsOf(DF, 0.7, 9.4, 18, P, { phase: 0.17 }), { size: 0.4 }), 1.1);
  put([-23, 0, 13], S(box(-26, -20, -3, 3, 12, 14.6, { r: 0.5, steps: 3 }), { tone: "mid" }), 0);
  put([-23, 0, 18], S(bar([-23, 0, 14.4], [-23, 0, 21], 0.9), { tone: "mid", crease: "none" }), 2);
  put([-23, 0, 21], S(ball([-23, 0, 21], 0.9), { tone: "mid" }), 2.1);
  put([-13, 0, 21], S(bar([-23, 0, 21], [-4, 0, 21], 0.9), { tone: "mid", crease: "none" }), 2.2);
  put([-4, 0, 21], S(ball([-4, 0, 21], 0.9), { tone: "mid" }), 2.3);
  put([-4, -2.6, 18.6], S(yCyl(-4, 18.6, -3.2, -2.2, 2.4), { tone: "mid", inner: L(G.circleOf(G.frameOf(W([-4, -2.2, FLOOR + 18.6]), [0, 1, 0], [1, 0, 0], [0, 0, 1]), 0, 0.9, P), { tone: "faint" }) }), 2.4);
  put([-4, 0, 17], S(bar([-4, 0, 20.4], [-4, 0, 14.2], 0.6), { tone: "mid", crease: "none" }), 2.5);
  put([-4, 0, 13.8], S(G.disc(1.4, 2.2, 1.6, DF, P), { tone: "hi" }), 2.6);
  put([-4, 2.6, 18.6], S(yCyl(-4, 18.6, 2.2, 3.2, 2.4), { tone: "mid", inner: L(G.circleOf(G.frameOf(W([-4, 3.2, FLOOR + 18.6]), [0, 1, 0], [1, 0, 0], [0, 0, 1]), 0, 0.9, P), { tone: "faint" }) }), 2.7);
  // carriage: frame C (bar C with rack teeth along the front, arms C', C²), inner frame E, bar F with pins e at the back
  for (const y of [-1, 1]) {
    put([-4, y * 25.5, 12.6], S(box(-22, 13, y > 0 ? 24.4 : -26.6, y > 0 ? 26.6 : -24.4, 12, 13.2), { tone: "mid" }), y > 0 ? 3 : -3);
    put([-4, y * 20.6, 12.5], S(box(-19.6, 11.6, y > 0 ? 19.8 : -21.4, y > 0 ? 21.4 : -19.8, 12, 12.9), { tone: "lo" }), y > 0 ? 1.5 : -2);
  }
  put([-20.3, 0, 12.5], S(box(-21.2, -19.6, -21.4, 21.4, 12, 12.9), { tone: "lo" }), -2.5);
  const rack = [];
  for (let y = -25; y <= 25.01; y += 1.25) rack.push(top([[13, y], [16.2, y]], 14.2));
  put([14.6, 0, 13.2], S(box(13, 16.2, -27, 27, 12, 14.2), { tone: "mid", inner: "" }) + L(rack.join(""), { tone: "faint" }), 4);
  put([-24, 14, 13.2], S(box(-25, -23.4, 5, 24, 12, 14.2), { tone: "mid" }) + D(Array.from({ length: 12 }, (_, i) => k.iso(W([-24.2, 6.4 + i * 1.5, FLOOR + 14.2]), P)), { size: 0.35 }), -1);
}

// 1878 · Brooks, US 202,923, sheet 1 Fig. 1 (plan) and Fig. 2 (cross-section).
// Frame A (narrow body on a splayed base), cylindrical platen B in sliding frame C, handle H with spiral spring I,
// type-bars D under the top (hidden), keys E at the front, the carriage rod with knurled ends at the back.
function brooks(put, W) {
  const { box, at3, yFrame, zFrame, yCyl, bar, ball, top } = kitFor(W);
  const baseF = G.frameOf(at3(0, -16, 0), [0, 1, 0], [1, 0, 0], [0, 0, 1]);
  put([0, 0, 7], S(G.prismOf(baseF, [[-17.7, 0], [17.7, 0], [17.7, 1.4], [9.4, 15.4], [-9.4, 15.4], [-17.7, 1.4]], 0, 32, P), { tone: "mid" }), -30);
  put([0, 0, 21], S(box(-9.4, 9.4, -16, 16, 15.4, 27), { tone: "mid" }), -20);
  put([0, 0, 27.7], S(box(-15, 15, -19, 19, 27, 28.4, { r: 1.5, steps: 4, bevel: 0.5 }), { tone: "mid" }), -10);
  const ringPts = Array.from({ length: 49 }, (_, i) => [8.6 * Math.cos((i / 48) * Math.PI * 2), 8.6 * Math.sin((i / 48) * Math.PI * 2)]);
  put([0, 0, 28.4], L(top(ringPts, 28.4, true), { tone: "faint" }), -9);
  // keys E: levers out through the front slope, round finger-pieces
  for (let i = 0; i < 8; i++) {
    const y = -12.25 + i * 3.5;
    put([18, y, 7.5], S(box(14.6, 19.8, y - 0.4, y + 0.4, 6.8, 7.4, { r: 0.2 }), { tone: "lo" }) + S(G.disc(0, 0.9, 1.4, zFrame(19.6, y, 7.4), P), { tone: "hi" }), 0);
  }
  // carriage rod at the back on two posts, knurled knobs
  for (const y of [-15, 15]) put([-10, y, 30], S(box(-10.8, -9.2, y - 0.8, y + 0.8, 28.4, 31), { tone: "mid" }), y > 0 ? 1 : -1);
  put([-10, 0, 31], S(yCyl(-10, 31.2, -18, 18, 0.7), { tone: "mid", crease: "none" }), 1.2);
  for (const y of [-19.6, 18]) {
    const F = yFrame(-10, y, 31.2);
    put([-10, y, 31], S(G.disc(0, 1.6, 1.4, F, P), { tone: "mid", inner: k.fadedSvg(G.ribsOf(F, 0, 1.6, 1.4, 16, P, { fade: [0.05, 0.4] }), { tone: "faint" }) }), y > 0 ? 1.4 : -1.4);
  }
  // platen B
  const PF = yFrame(0, -7.5, 32.4);
  put([0, 0, 32], S(G.disc(0, 15, 4.3, PF, P), { tone: "mid", inner: k.fadedSvg(G.ribsOf(PF, 0.3, 14.7, 4.3, 40, P, { fade: [0.05, 0.4] }), { tone: "faint" }) }), 2);
  for (const y of [-8.9, 7.5]) put([0, y, 32.4], S(yCyl(0, 32.4, y, y + 1.4, 1.1), { tone: "lo" }), y > 0 ? 2.2 : 1.8);
  // the mutation: sliding frame C, handle H and spiral spring I
  for (const y of [-9.4, 9.4]) put([-2, y, 32.4], mut(bar([-10, y, 31.2], [7.5, y, 32.4], 0.5), "hi", { crease: "none" }), y > 0 ? 3 : 1.6);
  put([7.5, 0, 32.4], mut(bar([7.5, -9.4, 32.4], [7.5, 9.4, 32.4], 0.5), "hi", { crease: "none" }), 3.1);
  put([12.4, 0, 30.4], S(box(11.8, 13, -1, 1, 28.4, 32.6, { r: 0.3 }), { tone: "mid" }), 3.15);
  const coil = k.coil(W([7.9, 0, 0])[0], W([11.7, 0, 0])[0], [0, FLOOR + 32.4], 0.9, 5, "x", P);
  put([10, 0, 32.4], mutLine(coil.back, { tone: "lo" }), 3.2);
  put([10, 0, 32.4], mut(bar([7.5, 0, 32.4], [14.2, 0, 32.4], 0.35), "hi", { crease: "none" }), 3.3);
  put([10, 0, 32.4], mutLine(coil.front, { tone: "lo" }), 3.4);
  put([14.6, 0, 32.4], mut(ball([14.8, 0, 32.4], 0.95)), 3.5);
}

// 1913 · Smathers, US 1,077,005, sheet 1 Fig. 1 (vertical section) and sheet 2 Fig. 2 (plan): only the power
// train is drawn, so only the power train stands here. Driven roller 1, elliptic wheels 2 (one pair per key),
// links 7 and 8, bars 9, rods 21, key levers 19 with four stepped keys, fulcrum 17, link 16, type-bar 18, lever 20.
// Mirrored so the keys face +x. Sheet pixels (150 dpi) to world: x = (470 - px) * 0.05, z = (900 - py) * 0.05.
function smathers(put, W) {
  const { box, at3, yFrame, zFrame, yCyl, bar, ball } = kitFor(W);
  const s = (px, py) => [(470 - px) * 0.05 * 1.5, (900 - py) * 0.05 * 1.5];
  const ys = [-2.4, -0.8, 0.8, 2.4];
  const keys = [[140, 640, 760], [180, 625, 740], [215, 597, 720], [250, 577, 705]];
  const bend = s(300, 690);
  const fulcrum = s(522, 690);
  // the power roller and its wheels, back to front in y
  const [rx, rz] = s(470, 830);
  const wheels = [s(400, 820), s(545, 820)];
  const ell = Array.from({ length: 20 }, (_, i) => [1.9 * Math.cos((i / 20) * Math.PI * 2), 2.6 * Math.sin((i / 20) * Math.PI * 2)]);
  put([rx, -6.4, rz], S(yCyl(rx, rz, -7.4, -5.2, 0.5), { tone: "lo" }), -6);
  const RF = yFrame(rx, -5.2, rz);
  put([rx, 0, rz], mut(G.disc(0, 10.4, 3.4, RF, P), "hi", { inner: k.fadedSvg(G.ribsOf(RF, 0.3, 10.1, 3.4, 30, P, { fade: [0.05, 0.4], twist: 0.35 }), { tone: "lo" }) }), -0.5);
  put([rx, 6.4, rz], S(yCyl(rx, rz, 5.2, 7.4, 0.5), { tone: "lo" }), 6);
  for (const [wx, wz] of wheels) put([wx, 0, wz], S(yCyl(wx, wz, -5, 5, 0.3), { tone: "lo", crease: "none" }), -1);
  ys.forEach((y, n) => {
    const lift = n * 0.02;
    for (const [wx, wz] of wheels) {
      const F = yFrame(wx, y - 0.25, wz);
      put([wx, y, wz], S(G.prismOf(F, ell, 0, 0.5, P), { tone: "mid" }) + D([k.iso(G.pointOf(F, 0.5, 0, 0), P)], { size: 0.45 }), lift);
    }
    const [k9a, k9z] = s(380, 745);
    const [k9b] = s(540, 745);
    put([0, y, k9z], S(bar([k9a, y, k9z], [k9b, y, k9z], 0.3), { tone: "mid", crease: "none" }), 0.4 + lift);
    for (const [wx, wz] of wheels) {
      const end = Math.abs(wx - k9a) < Math.abs(wx - k9b) ? k9a : k9b;
      put([wx, y, wz + 2], S(bar([end, y, k9z], [wx, y, wz + 0.9], 0.25), { tone: "lo", crease: "none" }) + S(ball([end, y, k9z], 0.38), { tone: "mid" }), 0.5 + lift);
    }
    for (const px of [375, 540]) {
      const [x21] = s(px, 0);
      put([x21, y, 9], S(bar([x21, y, k9z], [x21, y, fulcrum[1]], 0.25), { tone: "lo", crease: "none" }), 0.6 + lift);
    }
    const [kx, kz] = s(keys[n][0], keys[n][1]);
    const [, kb] = s(0, keys[n][2]);
    const lever = [[kx, kz], [kx, kb], [kx - 2.2, kb], bend, fulcrum];
    for (let i = 0; i + 1 < lever.length; i++) {
      const [ax, az] = lever[i];
      const [bx, bz] = lever[i + 1];
      put([(ax + bx) / 2, y, (az + bz) / 2], S(bar([ax, y, az], [bx, y, bz], 0.32), { tone: "mid", crease: "none" }) + S(ball([bx, y, bz], 0.32), { tone: "mid" }), 1 + lift);
    }
    put([kx, y, kz + 0.4], S(G.disc(0, 0.6, 1.3, zFrame(kx, y, kz), P), { tone: "hi" }), 1.5 + lift);
  });
  // fulcrum 17, link 16 and type-bar 18 (one, as drawn), lever 20 with its stop
  put([fulcrum[0], 0, fulcrum[1]], S(box(fulcrum[0] - 0.8, fulcrum[0] + 0.8, -3.4, 3.4, fulcrum[1] - 0.8, fulcrum[1] + 0.8), { tone: "lo" }), 2);
  const link = [fulcrum, s(522, 565), s(590, 452)];
  const head = s(362, 380);
  put([fulcrum[0] - 1, 0, 26], S(bar([link[0][0], 0, link[0][1]], [link[1][0], 0, link[1][1]], 0.4), { tone: "mid", crease: "none" }) + S(ball([link[1][0], 0, link[1][1]], 0.4), { tone: "mid" }) + S(bar([link[1][0], 0, link[1][1]], [link[2][0], 0, link[2][1]], 0.4), { tone: "mid", crease: "none" }), 2.5);
  put([link[2][0], 0, link[2][1]], S(yCyl(link[2][0], link[2][1], -0.6, 0.6, 0.8), { tone: "mid" }), 2.6);
  put([0, 0, 35], S(bar([link[2][0], 0, link[2][1]], [head[0], 0, head[1]], 0.45), { tone: "mid", crease: "none" }) + S(box(head[0] - 0.6, head[0] + 0.6, -0.5, 0.5, head[1] - 0.6, head[1] + 0.6, { r: 0.15 }), { tone: "hi" }), 2.7);
  const [l20x, l20z] = s(690, 690);
  put([l20x, 2.4, l20z], S(bar([fulcrum[0], 2.8, fulcrum[1]], [l20x, 2.8, l20z], 0.3), { tone: "mid", crease: "none" }) + S(box(l20x - 0.7, l20x + 0.7, 2, 3.6, l20z + 0.4, l20z + 1.6), { tone: "lo" }), 2.8);
}

// 1959 · Palmer (IBM), US 2,919,002, sheet 1 Fig. 1 (front view, turned on the sheet) and sheet 2 Fig. 2.
// Platen 36, single printing element 10 with hub 11 on shaft 15, carrier 38 on rails 243 and 218, open frame 106
// holding shaft 92, pulley 90 and the latch plates 141-144. Sheet px (120 dpi) to world: z = (575 - px) * 0.042,
// y = (py - 720) * 0.042; depth (x) is not on the sheet and is kept shallow.
function palmer(put, W) {
  const { box, at3, yFrame, zFrame, yCyl, bar, ball } = kitFor(W);
  const q = 0.042 * 1.3;
  const zOf = (px) => (575 - px) * q;
  const yOf = (py) => (py - 720) * q;
  const Y0 = yOf(330), Y1 = yOf(1110);
  // open frame 106: two long bars and two end plates, shaft 92 and pulley 90 inside, latch plates
  const fx0 = 0, fx1 = 9;
  put([4.5, Y0, 5], S(box(fx0, fx1, Y0 - 1, Y0, 0, zOf(395), { r: 0.5, steps: 3 }), { tone: "mid" }), -8);
  put([4.5, 0, 0.5], S(box(fx0, fx1, Y0, Y1, 0, 1.2), { tone: "lo" }), -9);
  put([fx0 + 0.6, 0, zOf(395) - 0.6], S(box(fx0, fx0 + 1.2, Y0, Y1, zOf(395) - 1.2, zOf(395)), { tone: "mid" }), -7);
  put([4.5, yOf(480), zOf(460)], S(yCyl(4.5, zOf(460), Y0, yOf(640), 0.7), { tone: "mid", crease: "none" }), -3);
  const PF = yFrame(4.5, yOf(640), zOf(460));
  put([4.5, yOf(650), zOf(460)], S(G.disc(0, 1.4, 2.6, PF, P), { tone: "mid", inner: L(G.circleOf(G.frameOf(at3(4.5, yOf(640) + 1.4, zOf(460)), [0, 1, 0], [1, 0, 0], [0, 0, 1]), 0, 1, P), { tone: "faint" }) }), -2.5);
  put([4.5, yOf(720), zOf(460)], S(yCyl(4.5, zOf(460), yOf(655), yOf(800), 1.3), { tone: "lo" }), -2.4);
  for (let i = 0; i < 4; i++) {
    const y = yOf(840 + i * 62);
    put([4.5, y, 3], S(box(2.4, 6.6, y - 0.3, y + 0.3, 1.2, zOf(395) - 1.2, { r: 0.15 }), { tone: "mid" }) + D([k.iso(at3(2.4, y + 0.3, 4.4), P)], { size: 0.45 }), -2 + i * 0.01);
  }
  put([fx1 - 0.6, 0, zOf(395) - 0.6], S(box(fx1 - 1.2, fx1, Y0, Y1, zOf(395) - 1.2, zOf(395)), { tone: "mid" }), -1);
  put([4.5, Y1, 5], S(box(fx0, fx1, Y1, Y1 + 1, 0, zOf(395), { r: 0.5, steps: 3 }), { tone: "mid" }) + D([k.iso(at3(4.5, Y1 + 1, zOf(395) / 2), P)], { size: 0.6 }), 8);
  // rails 243 and 218, carrier 38
  for (const [x, px] of [[-1.8, 325], [-0.2, 360]]) put([x, 0, zOf(px)], S(yCyl(x, zOf(px), Y0 - 1, Y1 + 1, 0.45), { tone: "mid", crease: "none" }), 0 + x * 0.01);
  const cy = yOf(675);
  put([-1, cy, zOf(345)], S(box(-3.4, 1.4, yOf(600), yOf(750), zOf(390), zOf(300), { r: 0.5, steps: 3 }), { tone: "mid" }), 1);
  // platen 36 behind the element, knobs at both ends
  const PL = yFrame(-7.4, Y0 - 2, zOf(225));
  put([-7.4, 0, zOf(225)], S(G.disc(0, Y1 - Y0 + 4, 2.3, PL, P), { tone: "mid", inner: k.fadedSvg(G.ribsOf(PL, 0.3, Y1 - Y0 + 3.7, 2.3, 34, P, { fade: [0.05, 0.4] }), { tone: "faint" }) }), -4);
  for (const y of [Y0 - 4, Y1 + 2]) put([-7.4, y, zOf(225)], S(yCyl(-7.4, zOf(225), y, y + 2, 1.6), { tone: "lo" }), y > 0 ? -3.8 : -4.2);
  // the mutation: element 10 on shaft 15
  const bx = -7.4 + 2.3 + 2.6;
  const bz = zOf(205);
  put([bx, yOf(690), zOf(280)], S(bar([bx, yOf(690), zOf(300)], [bx, yOf(690), bz], 0.45), { tone: "mid", crease: "none" }), 2);
  put([bx, yOf(690), bz], mut(ball([bx, yOf(690), bz], 2.6)), 3);
  const EF = zFrame(bx, yOf(690), bz);
  const type = [];
  for (const s of [-1.6, -0.55, 0.55, 1.6]) type.push(...G.dotsOf(EF, s, Math.sqrt(2.6 * 2.6 - s * s), 22, P, { slope: -s / Math.sqrt(2.6 * 2.6 - s * s), fade: [0.04, 0.42] }));
  put([bx, yOf(690), bz + 1], `<g class="mut-dots">${D(type, { size: 0.42, tone: "lo" })}</g>`, 3.1);
  put([bx, yOf(690), bz + 2.6], mut(G.disc(2.3, 3.0, 0.9, EF, P)), 3.2);
}

const BUILDS = [sholes, brooks, smathers, palmer];

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
  label: `${lineage.title}: ${lineage.ancestors.length} patented ancestors of the typewriter float in a row above a timeline, each redrawn from its patent drawing. ${lineage.ancestors.map((a) => `${a.year}, ${a.name} (${a.id}): ${a.trait}.`).join(" ")}`,
  body: [timeline(), marker(), specimens],
});

const SHEETS = lineage.ancestors.map((a) => sheetUri(HERE, a.sheet && a.sheet.file));
const data = lineage.ancestors.map((a) => ({ id: a.id, year: a.year, name: a.name, short: a.short, trait: a.trait, url: a.url, sheet: "", sheetUrl: a.sheet ? a.sheet.url : "", inventor: a.inventor, number: a.id.replace(/^US0*/, "US ").replace(/(\d)(?=(\d{3})+(?!\d))/g, "$1,").replace(/[AB]\d?$/, "") }));
const readoutOf = (a) => `${a.year} · ${a.inventor} · ${a.number} · ${a.short}`;

const live = `
const P = ${JSON.stringify(P)};
const STATIONS = ${JSON.stringify(STATIONS)};
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
const sources = `<p class="origin-sources">Patents checked against Google Patents on ${lineage.checked.slice(0, 10)}: ${data.map((a) => `<a href="${a.url}" target="_blank" rel="noopener">${a.number}</a> (${a.year}, ${a.inventor})`).join(" · ")}. Each figure is redrawn from sheet 1 of its patent (page 1 of the patent PDF); the 1913 sheet shows only the power train, so only the power train is drawn. A patent marks the first filing of a trait, not necessarily its first appearance. Not drawn: W. A. Burt, typographer, 1829 (record lost in the 1836 fire); F. X. and H. L. Wagner, front-strike machine, 1893 (unverified).</p>`;

const body = k.plateHtml({
  fig: "Fig 1",
  title: lineage.title,
  hint: "Hover a specimen · ← → · click for the patent",
  readout: readoutOf(data[0]),
  keys: [
    { mark: "lit", label: "The trait this ancestor added: what the patent first claimed" },
    { mark: "raised", label: "Everything it inherited from the one before" },
  ],
  caption: `${lineage.question} Four verified US patents, 1868 to 1959: a ring of type-bars under a piano row of keys (Sholes, Glidden & Soule), a platen frame that shifts for capitals (Brooks), a motor-driven roller that throws the bars (Smathers) and a single type ball that replaces them all (Palmer, IBM). The box stands up on a pedestal, sheds its case, and lies down as a slab. Burt's typographer of 1829 was patented too, but its record burned in the Patent Office fire of 1836: it cannot be verified, so it is not drawn. Neither is Wagner's front-strike visible writing (1893): its patent could not be checked in time.`,
  body: `<div class="origin-tools"><button type="button" data-export="png" title="Download as PNG">↓ png</button><button type="button" data-export="svg" title="Download as SVG">↓ svg</button></div><div class="iso-stage" tabindex="0" role="slider" aria-label="${lineage.title}: arrow keys walk from ancestor to ancestor" aria-valuemin="1" aria-valuemax="${data.length}" aria-valuenow="1">${svg}</div>`,
});

const name = theme === "light" ? "typewriter-light.html" : "typewriter.html";
const page = k.pageHtml({ title: lineage.title, theme, body: body + sheetHtml + gallery + sources, script: kitScript() + live, width: 1000 }).replace("</style>", `${SHEET_CSS}</style>`);
writeFileSync(join(HERE, name), page);
console.log("wrote", name);
