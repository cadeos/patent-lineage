---
name: patent-lineage
description: Draw the genealogy of an everyday object as a "march of progress" built from real patents. Name a product (vacuum cleaner, telephone, computer mouse, typewriter, zipper…) and Claude finds its patented ancestors, verifies every patent number against Google Patents, reads each patent's drawing sheet, and redraws the ancestors as interactive isometric specimens floating in a row above a minimal timeline, with the one trait each ancestor added lit up. Use it when someone asks for the evolution, history, ancestry, lineage or "how X evolved" of a product or invention, a patent timeline, or an "Australopithecus to Homo sapiens" style picture of a technology, even if they never say "patent". Built on the isometric kit of Anatomy by Ryan (wheresryan22, MIT).
license: MIT
compatibility: Written for Claude Code. Needs Node.js 20.10+, network access to patents.google.com, Chrome or Chromium for the checks, and optionally pdftoppm (poppler) for pre-1971 drawing sheets.
---

# Patent lineage

This skill makes one picture: the ancestors of an object marching in a row, oldest on the left, each one redrawn from its own patent drawing and floating above a thin timeline that carries only a dot and a year per ancestor. The reader sees in one glance how the thing changed shape, and in each specimen one part is lit: **the trait that ancestor added**, the thing its patent first claimed. Hover slides a lit dot along the timeline and lights the next mutation; the original drawing sheet appears under the card.

It is built on [Anatomy](https://github.com/wheresryan22/anatomy) by Ryan ([@wheresryan22](https://github.com/wheresryan22), MIT license). The drawing kit, the style and the check scripts are his and are used unchanged. Its kit, its craft rules and its checks apply unchanged: read `kit/` and anatomy's `references/craft.md`, `kit.md` and `verify.md` before drawing (they are not repeated here). What this skill adds is **the truth step** (finding and verifying the lineage) and **the march** (the layout and interaction).

Three examples ship with it. Open the closest one before you start; each builds with `node examples/<name>/build.mjs` (add `--light`).

- `examples/vacuum-cleaner/` is the reference and the smallest: Hess 1860 (bellows) → McGaffey 1869 (hand-cranked fan) → Spangler 1908 (electric motor) → Dyson 1986 (cyclone) → iRobot 2003 (self-steering).
- `examples/computer-mouse/` shows internal mutations through **cutaways** (a ball, a light and a detector) and a **magnified** scale: Engelbart 1970 → Rider 1974 → Kirsch 1983 → Gillick 1996 → Hotelling 2010.
- `examples/typewriter/` is the dense one, and shows a lineage with a **gap**: four verified ancestors, with Burt 1829 (lost in the 1836 Patent Office fire) named in the caption only.

## The one idea that matters

**A patent is a fossil.** It is dated, it has a drawing, and it says in its own words what was new. The figure must only show what the fossils prove:

- Every ancestor is a real, verified patent. **Never draw an ancestor whose number did not pass `scripts/verify-patents.mjs`.** A plausible patent number from memory is the most likely way this skill lies; the check exists because models invent them (in testing it caught a wrong Kirsch number and a wrong inventor on the first try).
- Every specimen is redrawn from **that patent's drawing sheet**, not from what the product "usually looks like". If the sheet shows no handle, the specimen has no handle.
- The lit part is the **claimed novelty**, quoted in `lineage.json` as `evidence` from the patent text or figure labels.
- Captions say *patented*, never *invented*. A patent marks the first filing of a trait, not necessarily its first appearance.

## Workflow

1. **Size it.** Five ancestors is a Hero (2 to 4 hours). Three is a quick Figure; more than seven is an Epic: propose seven and list the rest in the sources line. Tell the user before you start. Work on **one object at a time**: Google Patents rate-limits this machine within minutes if lineages are researched in parallel.
2. **Find candidates.** Read `references/lineage.md`. Build a list of 8 to 15 candidates from the classification (CPC) of the modern product, the citation graph of a modern patent (backward references work well after 1947), and what you know of the history. Prefer ancestors where the *shape* changes, not only the internals: the march must read without labels. Do not use Google's `xhr/query` search endpoint: it triggers the block fastest.
3. **Choose the march.** Pick 4 to 7 ancestors so that each adds exactly one visible trait to the one before. Write `lineage.json` (schema in `references/lineage.md`): `id`, `year`, `inventor`, `title`, `name`, `trait`, `short`, `evidence`, `pose`. `year` is the **publication (grant) year**, as in the examples; the check also accepts the priority year and tells you when you used it. Placeholder text ("tbd") is rejected.
4. **Verify.** `node scripts/verify-patents.mjs path/lineage.json --drawings`. It fetches each patent page (cached in `.patent-cache/`, paced, with automatic back-off), checks number (design patents `USD…` included), year, inventor or assignee (falling back to the OCR text for 1800s patents) and title (fuzzy, falling back to the OCR text too), saves sheet 1 of each **verified** patent to `drawings/`, and writes `lineage.verified.json` with the page facts, the abstract and claim 1 (where the page has them) and whether each patent cites an earlier ancestor. A failure means the lineage is wrong: **fix `lineage.json`, never the check.** If Google blocks the machine, the script says "rate-limited", exits 3 and writes nothing: wait and run again, it is not a lineage error. To fix a text field afterwards without any network request: `--text-only`. The build refuses unverified data.
5. **Read every sheet.** Open each `drawings/*-sheet1.png` and write, per ancestor, a parts list (at least 8 parts) using the patent's own reference letters or numbers (`bellows D`, `fan W`, `motor 2`…). Correct `trait` if the drawing disagrees with your memory: for the vacuum, the drawing showed that Hess's 1860 sweeper already had a suction bellows, not just a brush. If a sheet shows only a section, a plan or a fragment (Smathers' power train, Palmer's ball), **draw only what is shown**, guess depth and hidden sides only where the sheet forces it, and say so in the caption.
6. **Plan the row.** One world, one camera, one scale for every specimen, so size differences are real. A small object (a mouse, a zipper) is magnified by the **same factor** for all ancestors; say the factor in the caption. The march runs along +x. Camera azimuth 100 to 110°, elevation 22 to 26°: the row climbs to the right, but each specimen is then seen from its left-rear, so **turn a specimen about z** if its important face (a keyboard, a front panel) is edge-on. Stations evenly spaced (the timeline is an order, not a scale: the labels carry the years). The `pose` field (`crouched`, `leaning`, `upright`, `lying`) is a check on the silhouette sequence, which is the joke and the point of the march. Derive station counts and fit points from `lineage.ancestors.length`, never hard-code five.
7. **Build each specimen** as a function `(put, W)` like those in `examples/vacuum-cleaner/build.mjs`: `W` maps station-local points to world, `put(point, svg, bias)` queues an item by depth. Mark the trait's solids with `className: "mut"` and its lines with `mut-line`: the live code lights only the chosen station's mutation. Keep the anatomy tone hierarchy: wheels and feet `lo`, bodies `mid`, the mutation `hi` and `lit` when chosen. When the mutation is **inside** (a ball, a sensor, a motor), cut a window: it must wrap down the **near wall**, because a top-only window shows nothing at a 26° elevation (`examples/computer-mouse/build.mjs` has `shellOf`, `patchOf`, `torn` and `cutaway` for curved shells).
8. **Frame it.** Card corners: `Fig n`, the title (`Descent of the …`), the hint, and the readout `year · inventor · number · trait`. Under the card: the legend (lit = what this ancestor added, raised = what it inherited), a caption that tells the story in one paragraph, the **original-sheet panel** (a local copy from `drawings/`, updating with the selection) and the **sources line** with every patent linked and the date it was checked. Format numbers with `formatNumber(id)` from `scripts/patent-id.mjs`.
9. **Make it live.** Idle tour every 3.2 s; pointer chooses the nearest station by screen x; arrows, Home and End step; Enter or click opens the patent. Reduced motion: no tour, no easing. The lit dot eases for about 0.3 s, so wait that long before capturing.
    **Download buttons**: two quiet text buttons next to `Fig n` (`↓ png`, `↓ svg`) save the figure as it is shown, with the card background and the title (`Descent of the …`) at the top left; the PNG is 3× for Medium and social. The export clones the stage SVG, so keep the upper left of the row clear for the title (the oldest, lowest specimens sit there) and give every added element a class the page CSS styles. `window.figureMarkup()` returns the exported SVG for tests.
10. **Verify like a critic.** Everything in anatomy's `references/verify.md` applies: `scripts/capture.mjs` (desktop, 390 px phone, both themes), `scripts/drive.mjs` to step through every station, and `scripts/lines.mjs` must print `line ends: 0` on both pages (it does not check dot grids: look at those yourself at 4×). Then put each specimen's 4× crop next to its patent sheet and ask: would someone holding the sheet recognise the machine? On a 390 px phone the specimens render small: that is accepted, the readout and the sheet panel carry the message there.

## The march: layout rules

- **No base, no shadows.** The specimens float about 12 units above the timeline with nothing under them. A bench or plinth competes with the machines, and halos under floating objects read as noise (both tried and rejected).
- **Timeline**: one hairline along x on the floor plane, ending in terminal dots; at each station a small hollow dot and the year in plain small mono text below it. The chosen year turns strong and a solid lit dot slides to it. Nothing else: no ruler, no plates, no patent numbers on the line (they live in the readout, the sheet panel and the sources line).
- **Painter's order**: stations back to front by depth; inside a station, items sorted by the depth of a representative point plus a bias. For dense specimens, record shapes and let anatomy's `A.settle` decide (anatomy's `references/kit.md`, section 12).
- **The mutation stays one part**, never a whole machine: the bellows, the fan case, the motor dome, the cyclone with its dust swirl, the bumper sensors.
- **Composition**: the row fills 85 to 90% of the card width; the upper left stays quiet, since the oldest specimens are the lowest. The fit is width-limited: lowering the card height shrinks nothing but the empty space, raising it only adds margin.

## Files

| File | Use it for |
|---|---|
| `scripts/verify-patents.mjs` | The truth gate: verifies `lineage.json` against Google Patents, downloads drawing sheets, writes `lineage.verified.json`. |
| `scripts/patent-id.mjs` | `parseId`, `formatNumber` (`US 4,593,429`, `US D558,757`) and `samePatent` for ids with kind codes and design patents. |
| `references/lineage.md` | How to find ancestors, data sources and their limits, the JSON schema, and the honesty rules. |
| `examples/` | `vacuum-cleaner` (reference), `computer-mouse` (cutaways, magnified), `typewriter` (dense, with a gap): each has its `lineage.json`, the verified file, the downloaded sheets, `build.mjs` and the two pages. |
| `evals/evals.json` | Test prompts for the skill and what a good answer contains. |
| `kit/`, `scripts/capture.mjs`, `drive.mjs`, `lines.mjs`, `inline-kit.mjs` | From anatomy, unchanged (see `LICENSE.anatomy`). |

## Not yet (roadmap)

- **The bush view.** Gould's objection to the march: evolution is a bush. A second layout where dead branches (e.g. Booth's horse-drawn "Puffing Billy", 1901, GB) stand off the main line, joined by citation links.
- **Non-US ancestors** through EPO OPS / Espacenet (GB, DE, FR patents), with a registered key.
- **Audit-grade order**: record every specimen's shapes for `A.settle` and `A.auditOrExit` instead of depth keys.
- **Curved-shell helpers in the kit**: `shellOf`, `patchOf`, `cutaway` live in the mouse example only.
