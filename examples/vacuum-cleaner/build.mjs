import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../../kit/iso-kit.mjs";
import * as G from "../../kit/lathe.mjs";
import { kitScript } from "../../scripts/inline-kit.mjs";
import { sheetUri } from "../../scripts/sheet-uri.mjs";
import { formatNumber } from "../../scripts/patent-id.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const theme = process.argv.includes("--light") ? "light" : "dark";
const lineage = JSON.parse(readFileSync(join(HERE, "lineage.verified.json"), "utf8"));
if (lineage.ancestors.some((entry) => !entry.verified)) {
  console.error("lineage.verified.json has unverified ancestors: run scripts/verify-patents.mjs first");
  process.exit(1);
}

const WIDTH = 960;
const HEIGHT = 340;
const STATIONS = [-236, -118, 0, 118, 236];
const FLOOR = 12;
const LINE = [-286, 286];

const P = k.fitProjection(
  [[LINE[0], 0, -10], [LINE[1], 0, -10], [LINE[0], -24, 0], [LINE[1], 24, 0], [STATIONS[1] - 40, 0, FLOOR + 106], [STATIONS[2] - 50, 0, FLOOR + 106], [STATIONS[3] - 17, 0, FLOOR + 110], [STATIONS[4] + 20, 0, FLOOR + 14]],
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

function hess(put, W) {
  for (const y of [-16, 16]) {
    const c = W([10, y, FLOOR + 8]);
    put([10, y * 1.2, 8], S(wheel(c, 8, 2.4), { tone: "mid", inner: L(G.circleOf(wheelFrame(c, 2.4), y > 0 ? 2.4 : 0, 6.2, P), { tone: "faint" }) }), y > 0 ? 6 : -6);
    put([10, y * 1.2 + (y > 0 ? 1 : -1), 8], D([at(add(c, [0, y > 0 ? 1.3 : -1.3, 0]))], { size: 0.7 }), y > 0 ? 6.1 : -5.9);
  }
  for (const y of [-10, 10]) put([-15, y, 2], S(wheel(W([-15, y, FLOOR + 2.4]), 2.4, 1.6), { tone: "lo" }));
  const brushF = G.frameOf(W([10, -12, FLOOR + 4.6]), [0, 1, 0], [1, 0, 0], [0, 0, 1]);
  put([10, 0, 4], S(G.disc(0, 24, 4.4, brushF, P), { tone: "lo", inner: k.fadedSvg(G.ribsOf(brushF, 0.6, 23.4, 4.4, 26, P, { fade: [0.05, 0.4] }), { tone: "faint" }) }), -1);
  put([5, 0, 3], S(k.slabOf({ x: W([1, 0, 0])[0], y: -11, w: 13, d: 22, r: 1.5 }, FLOOR + 1.2, 4.2, P, 3, 0.4), { tone: "lo" }), -2);
  const frame = { x: W([-19, 0, 0])[0], y: -13, w: 34, d: 26, r: 2 };
  put([0, 0, 7], S(k.slabOf(frame, FLOOR + 5.4, 3, P, 4, 0.5), { tone: "mid", inner: L(k.sideSeam(frame, FLOOR + 6.9, P, 4), { tone: "faint" }) }), 2);
  put([0, 0, 9], D([[-16, -10.5], [-16, 10.5], [12, -10.5], [12, 10.5]].map(([x, y]) => at(W([x, y, FLOOR + 8.4]))), { size: 0.45 }), 2.1);
  const zig = [];
  for (let i = 0; i <= 8; i++) zig.push([-16 + i * 2, i % 2 === 0 ? 11.6 : 8.2]);
  const ring = [...zig, ...[...zig].reverse().map(([x, y]) => [x, -y])].map(([x, y]) => [W([x, 0, 0])[0], y]);
  const back = { x: W([-18.4, 0, 0])[0], y: -12.8, w: 2.4, d: 25.6, r: 0.6 };
  const front = { x: W([0, 0, 0])[0], y: -12.8, w: 2.4, d: 25.6, r: 0.6 };
  put([-17, 0, 14], mut(k.slabOf(back, FLOOR + 8.4, 15.4, P, 2, 0.4)), 3);
  put([-8, 0, 14], mut(k.extrude(ring, FLOOR + 9, 13.6, P, { convex: false })), 3.2);
  put([1.2, 0, 14], mut(k.slabOf(front, FLOOR + 8.4, 15.4, P, 2, 0.4)), 3.4);
  put([2.4, 12.8, 20], D([at(W([2.4, 11.6, FLOOR + 21])), at(W([2.4, 11.6, FLOOR + 11]))], { size: 0.45 }), 3.5);
  const hub = W([10, 17.8, FLOOR + 8]);
  const pin = W([2.4, 12.8, FLOOR + 16]);
  put([8, 18, 12], k.wireSvg(at(hub), at(pin), { tone: "mid", size: 0.9 }) + S(rod(add(hub, [0, 0.3, 0]), add(pin, [0, 0.3, 0]), 0.6), { tone: "mid", crease: "none" }), 9);
}

function mcgaffey(put, W) {
  const nozzle = G.frameOf(W([0, -15, FLOOR]), [0, 1, 0], [1, 0, 0], [0, 0, 1]);
  put([12, 0, 2], S(G.prismOf(nozzle, [[2, 0], [24, 0], [24, 0.9], [6, 7.5], [2, 7.5]], 0, 30, P), { tone: "mid" }), 1);
  for (const y of [-16.4, 16.4]) {
    const c = W([7, y, FLOOR + 3]);
    put([7, y, 3], S(wheel(c, 3, 1.6), { tone: "lo" }) + D([at(add(c, [0, y > 0 ? 0.9 : -0.9, 0]))], { size: 0.45 }), y > 0 ? 4 : -4);
  }
  const base = W([1, 0, FLOOR + 6]);
  const dir = unit([-0.56, 0, 0.83]);
  const down = unit([-0.83, 0, -0.56]);
  const H = G.frameAlong(base, dir);
  put([1, 0, 8], mut(G.disc(0, 9, 11, H, P), "hi", { inner: L(G.arcOf(H, 4.5, 11, P), { tone: "faint" }) }), 2);
  put([0, 0, 13], D(G.dotsOf(H, 9, 8.6, 10, P, { all: true }), { size: 0.45 }), 2.1);
  put([-20, 0, 40], S(G.disc(9, 108, 1.3, H, P), { tone: "mid", crease: "none" }), -3);
  const bagF = G.frameAlong(add(base, mul(down, 7.5)), dir);
  const bag = G.solidOf([[14, 2.4, 1], [22, 6.4, 1], [34, 7.6, 1], [46, 5.2, 1], [54, 1.6, 1]], bagF, P);
  put([-22, 0, 28], S(bag, { tone: "mid", inner: L([22, 34, 46].map((s) => G.arcOf(bagF, s, s === 34 ? 7.6 : s === 22 ? 6.4 : 5.4, P)).join(""), { tone: "faint" }) }), -6);
  const top = add(base, mul(dir, 92));
  const pulley = G.frameOf(add(top, [0, 2.2, 0]), [0, 1, 0], [1, 0, 0], [0, 0, 1]);
  put([-50, 3, 80], S(G.disc(0, 2.4, 8.6, pulley, P), { tone: "mid", inner: L(G.arcOf(pulley, 1.2, 8.6, P), { tone: "faint" }) }), 6);
  put([-50, 4, 80], L(G.circleOf(pulley, 2.4, 6.4, P), { tone: "faint" }) + D([at(add(top, [0, 4.6, 0]))], { size: 0.6 }), 6.1);
  const crankAt = add(top, [5.6 * 0.7, 4.6, 5.6 * 0.7]);
  put([-48, 6, 84], S(rod(crankAt, add(crankAt, [0, 5, 0]), 0.8), { tone: "mid" }) + S(G.sphereOf(add(crankAt, [0, 6.2, 0]), 1.5, P), { tone: "hi" }), 7);
  put([-58, 0, 92], S(G.sphereOf(add(base, mul(dir, 109)), 2, P), { tone: "mid" }), -2);
  const beltTop = add(top, [0, 2.2 + 1.2, 0]);
  const beltA = add(beltTop, mul(down, 8.4));
  const beltB = add(beltTop, mul(down, -8.4));
  const drumA = add(add(base, mul(dir, 9)), [0, 3.2, 0]);
  put([-28, 4, 45], k.wireSvg(at(beltA), at(add(drumA, mul(down, 3))), { tone: "lo", size: 0.7 }) + k.wireSvg(at(beltB), at(add(drumA, mul(down, -5))), { tone: "lo", size: 0.7 }), 8);
}

function spangler(put, W) {
  for (const y of [-16.4, 16.4]) {
    const c = W([-12, y, FLOOR + 3.4]);
    put([-12, y, 3], S(wheel(c, 3.4, 2), { tone: "lo" }) + D([at(add(c, [0, y > 0 ? 1.1 : -1.1, 0]))], { size: 0.45 }), y > 0 ? 6 : -6);
  }
  const casing = G.frameOf(W([0, 0, FLOOR + 2]), [0, 0, 1], [1, 0, 0], [0, 1, 0]);
  put([0, 0, 8], S(G.disc(0, 13, 15, casing, P), { tone: "mid", inner: L(G.arcOf(casing, 6.5, 15, P), { tone: "faint" }) }), 0);
  put([0, 0, 15], D(G.dotsOf(casing, 13, 13.4, 16, P, { all: true }), { size: 0.4 }), 0.1);
  const housing = { x: W([12, 0, 0])[0], y: -15, w: 10, d: 30, r: 3 };
  put([17, 0, 6], S(k.slabOf(housing, FLOOR + 1, 9.4, P, 4, 0.6), { tone: "mid", inner: L(k.sideSeam(housing, FLOOR + 4.2, P, 4), { tone: "faint" }) }), 4);
  const motor = G.frameOf(W([0, 0, FLOOR + 15]), [0, 0, 1], [1, 0, 0], [0, 1, 0]);
  const dome = G.solidOf([[0, 9.6], [1.6, 9.6], [3, 9.4, 1], [7, 8.2, 1], [10, 5.6, 1], [11.6, 2.4, 1]], motor, P);
  put([0, 0, 22], mut(dome, "hi", { inner: L(G.arcOf(motor, 1.6, 9.6, P), { tone: "faint" }) }), 1);
  put([0, 0, 29], mut(G.disc(11, 13.4, 1.6, motor, P)), 1.1);
  put([0, 0, 18], D(G.dotsOf(motor, 0.8, 9.6, 8, P), { size: 0.45 }), 1.2);
  const base = W([-9, 0, FLOOR + 14]);
  const dir = unit([-0.5, 0, 0.87]);
  const back = unit([-0.87, 0, -0.5]);
  const H = G.frameAlong(base, dir);
  put([-30, 0, 60], S(G.disc(0, 100, 1.4, H, P), { tone: "mid", crease: "none" }), -2);
  put([-60, 0, 103], S(G.sphereOf(add(base, mul(dir, 102)), 2.2, P), { tone: "mid" }), -2);
  const reel = G.frameAlong(add(base, mul(dir, 52)), dir);
  put([-26, 0, 60], S(G.disc(0, 6, 3.2, reel, P), { tone: "mid", inner: k.fadedSvg(G.ribsOf(reel, 0.4, 5.6, 3.2, 18, P, { fade: [0.05, 0.4], twist: 0.2 }), { tone: "lo" }) }), 1);
  const bagF = G.frameAlong(add(base, mul(back, 10.5)), dir);
  const bag = G.solidOf([[24, 2, 1], [32, 7.8, 1], [60, 9.4, 1], [86, 7.6, 1], [94, 2.2, 1]], bagF, P);
  put([-40, 0, 55], S(bag, { tone: "mid", inner: L(G.arcOf(bagF, 60, 9.4, P), { tone: "faint" }) }), -8);
  const spoutFrom = W([-13.6, 0, FLOOR + 9]);
  const spoutTo = add(add(base, mul(back, 10.5)), mul(dir, 26));
  put([-17, 0, 22], S(rod(spoutFrom, spoutTo, 2.2), { tone: "mid", crease: "none" }), -5);
  const reelSide = add(add(base, mul(dir, 55)), [0, 3.2, 0]);
  put([-20, 6, 40], k.wireSvg(at(reelSide), at(W([-4, 9.4, FLOOR + 17])), { tone: "lo", via: [at(W([-16, 12, FLOOR + 30]))], size: 0.8 }), 12);
}

function dyson(put, W) {
  for (const y of [-15.6, 15.6]) {
    const c = W([-6, y, FLOOR + 12]);
    put([-6, y, 12], S(wheel(c, 12, 2.6), { tone: "mid", inner: L(G.circleOf(wheelFrame(c, 2.6), y > 0 ? 2.6 : 0, 9, P), { tone: "faint" }) }) + D([at(add(c, [0, y > 0 ? 1.4 : -1.4, 0]))], { size: 0.6 }), y > 0 ? 10 : -10);
  }
  const fan = G.frameOf(W([-4, -13.6, FLOOR + 11]), [0, 1, 0], [1, 0, 0], [0, 0, 1]);
  put([-4, 0, 11], S(G.disc(0, 27.2, 10.4, fan, P), { tone: "mid", inner: L([6, 21].map((s) => G.arcOf(fan, s, 10.4, P)).join(""), { tone: "faint" }) }), 0);
  const head = { x: W([4, 0, 0])[0], y: -14, w: 18, d: 28, r: 3 };
  put([13, 0, 4], S(k.slabOf(head, FLOOR + 0.6, 6.4, P, 4, 0.6), { tone: "mid", inner: L(k.sideSeam(head, FLOOR + 3.2, P, 4), { tone: "faint" }) }), 2);
  const binBase = G.frameOf(W([-4, 0, FLOOR + 21]), [0, 0, 1], [1, 0, 0], [0, 1, 0]);
  put([-4, 0, 23], S(G.disc(0, 3, 12.4, binBase, P), { tone: "lo" }), 1);
  const BIN_Z = FLOOR + 24;
  const BIN_TOP = FLOOR + 80;
  const binF = G.frameOf(W([-4, 0, BIN_Z]), [0, 0, 1], [1, 0, 0], [0, 1, 0]);
  const coneF = G.frameOf(W([-4, 0, BIN_TOP]), [0, 0, -1], [1, 0, 0], [0, 1, 0]);
  const swirl = [];
  for (let i = 0; i <= 220; i++) {
    const t = i / 220;
    const s = 4 + t * 44;
    const r = 10.6 - t * 1.6;
    const a = t * Math.PI * 2 * 5.5;
    swirl.push(G.pointOf(coneF, s, r, a));
  }
  const near = swirl.map((p) => depth(p) > depth(W([-4, 0, 0])));
  const runs = [];
  let run = [];
  swirl.forEach((p, i) => {
    if (i && near[i] !== near[i - 1]) {
      runs.push({ near: near[i - 1], points: run });
      run = [run[run.length - 1]];
    }
    run.push(p);
  });
  runs.push({ near: near[near.length - 1], points: run });
  const path = (points) => "M" + points.map((p) => at(p).map((v) => v.toFixed(1)).join(" ")).join("L");
  put([-4, 0, 50], L(G.circleOf(binF, 0, 11.6, P), { tone: "faint" }), 2);
  put([-4, 0, 50], runs.filter((r) => !r.near).map((r) => mutLine(path(r.points), { tone: "lo", dotted: true, flow: true, free: true })).join(""), 2.2);
  put([-4, 0, 50], mut(G.solidOf([[0, 9.2], [6, 9.2], [46, 2.6], [52, 2.6]], coneF, P), "hi"), 2.4);
  put([-4, 0, 50], runs.filter((r) => r.near).map((r) => mutLine(path(r.points), { tone: "lo", dotted: true, flow: true, free: true })).join(""), 2.6);
  const sideA = W([-4 + across[0] * 11.6, across[1] * 11.6, 0]);
  const sideB = W([-4 - across[0] * 11.6, -across[1] * 11.6, 0]);
  const glass = [sideA, sideB].map((p) => k.segment([p[0], p[1], BIN_Z], [p[0], p[1], BIN_TOP], P)).join("") + G.arcOf(binF, 0, 11.6, P) + G.arcOf(binF, BIN_TOP - BIN_Z, 11.6, P);
  put([-4, 0, 50], L(glass, { tone: "mid" }), 2.8);
  put([-4, 0, 50], k.fadeLineSvg([at([sideA[0] - across[0] * 3, sideA[1] - across[1] * 3, BIN_Z + 8]), at([sideA[0] - across[0] * 3, sideA[1] - across[1] * 3, BIN_TOP - 8])], { fade: [10, 10], tone: "faint" }), 2.9);
  const shroud = G.frameOf(W([-4, 0, BIN_TOP]), [0, 0, 1], [1, 0, 0], [0, 1, 0]);
  put([-4, 0, 86], S(G.disc(0, 7, 12.6, shroud, P), { tone: "mid", inner: L(G.arcOf(shroud, 3.5, 12.6, P), { tone: "faint" }) }), 3);
  put([-4, 0, 90], D(G.dotsOf(shroud, 7, 10.6, 12, P, { all: true }), { size: 0.4 }), 3.1);
  put([-19, 0, 55], S(rod(W([-19, 0, FLOOR + 14]), W([-19, 0, FLOOR + 102]), 2.4), { tone: "mid", inner: L([30, 60].map((s) => G.arcOf(G.frameAlong(W([-19, 0, FLOOR + 14]), [0, 0, 1]), s, 2.4, P)).join(""), { tone: "lo" }) }), -14);
  put([-19, 0, 105], S(rod(W([-19, 0, FLOOR + 102]), W([-19, 0, FLOOR + 110]), 1.6), { tone: "mid" }), -14);
  put([-12, 0, 110], S(rod(W([-19.6, 0, FLOOR + 110]), W([-6, 0, FLOOR + 110]), 1.7), { tone: "mid" }) + S(G.sphereOf(W([-5.4, 0, FLOOR + 110]), 2, P), { tone: "mid" }), -13);
  put([-12, 0, 95], S(rod(W([-15.4, 0, FLOOR + 94]), W([-12, 0, FLOOR + 94]), 1.4), { tone: "lo" }), -12);
}

function robot(put, W) {
  for (const y of [-14, 14]) put([0, y, 3], S(wheel(W([0, y, FLOOR + 3.4]), 3.4, 2.2), { tone: "lo" }), y > 0 ? 0.5 : -0.5);
  const body = G.frameOf(W([0, 0, FLOOR + 2]), [0, 0, 1], [1, 0, 0], [0, 1, 0]);
  put([0, 0, 6], S(G.disc(0, 6.4, 17, body, P, { bevel: 0.6 }), { tone: "mid", inner: L(G.arcOf(body, 3.2, 17, P, { from: Math.PI * 0.5, to: Math.PI * 1.5 }), { tone: "faint" }) }), 0);
  put([0, 0, 9], mut(G.ringBand(0.6, 5.6, 16.6, 17.5, body, P, { rims: "all" }), "hi"), 0.05);
  const lid = G.frameOf(W([0, 0, FLOOR + 8.4]), [0, 0, 1], [1, 0, 0], [0, 1, 0]);
  put([0, 0, 10], S(G.solidOf([[0, 15.6], [1, 14.4, 1], [1.8, 10, 1], [2.2, 0]], lid, P), { tone: "hi", inner: L(G.circleOf(lid, 0.01, 12.2, P), { tone: "faint" }) }), 0.1);
  put([0, 0, 11], L(G.circleOf(lid, 1.6, 6.4, P), { tone: "lo" }) + S(G.disc(1.6, 2.6, 3.2, lid, P), { tone: "mid" }), 0.2);
  const eyes = [-0.55, -0.3, 0, 0.3, 0.55].map((a) => at(W([Math.cos(a) * 17.6, Math.sin(a) * 17.6, FLOOR + 1.4])));
  put([17, 0, 2], `<g class="mut-dots">${D(eyes, { size: 0.8, tone: "lo" })}</g>`, 4);
}

const BUILDS = [hess, mcgaffey, spangler, dyson, robot];

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
  label: `${lineage.title}: five patented ancestors of the vacuum cleaner float in a row above a timeline, each redrawn from its patent drawing. ${lineage.ancestors.map((a) => `${a.year}, ${a.name} (${a.id}): ${a.trait}.`).join(" ")}`,
  body: [timeline(), marker(), specimens],
});

const SHEETS = lineage.ancestors.map((a) => sheetUri(HERE, a.sheet && a.sheet.file));
const data = lineage.ancestors.map((a) => ({ id: a.id, year: a.year, name: a.name, short: a.short, trait: a.trait, url: a.url, sheet: "", inventor: a.inventor, number: formatNumber(a.id) }));
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
  caption: `${lineage.question} Five verified US patents, 1860 to 2003: a bellows (Hess), a hand-cranked fan (McGaffey), an electric motor (Spangler), a cyclone instead of a bag (Dyson) and a robot that steers itself (iRobot). The line crouches, stands up, and lies down again.`,
  body: `<div class="origin-tools"><button type="button" data-export="png" title="Download as PNG">↓ png</button><button type="button" data-export="svg" title="Download as SVG">↓ svg</button></div><div class="iso-stage" tabindex="0" role="slider" aria-label="${lineage.title}: arrow keys walk from ancestor to ancestor" aria-valuemin="1" aria-valuemax="${data.length}" aria-valuenow="1">${svg}</div>`,
});

const name = theme === "light" ? "vacuum-cleaner-light.html" : "vacuum-cleaner.html";
const page = k.pageHtml({ title: lineage.title, theme, body: body + sheetHtml + gallery + sources, script: kitScript() + live, width: 1000 }).replace("</style>", `${SHEET_CSS}</style>`);
writeFileSync(join(HERE, name), page);
console.log("wrote", name);
