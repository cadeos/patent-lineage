# Contributing to Patent lineage

Contributions are welcome. Two things matter most: every claim in a figure must be true, and the drawings must hold up at 4 times zoom.

By taking part you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Setup

- **Node.js 20.10 or later.** Nothing to install.
- **Google Chrome or Chromium** for the browser checks (`CHROME_PATH` if needed).
- **Claude Code**, to try the skill itself.

```sh
git clone https://github.com/cadeos/patent-lineage.git
cd patent-lineage
ln -s "$PWD" ~/.claude/skills/patent-lineage
```

Move any installed copy out of the way first.

## Building the examples

```sh
node examples/vacuum-cleaner/build.mjs && node examples/vacuum-cleaner/build.mjs --light
node scripts/lines.mjs examples/vacuum-cleaner/vacuum-cleaner.html
node --test scripts/patent-id.test.mjs
```

The built pages are committed. `lines.mjs` must print `line ends: 0`.

## Adding a lineage

1. One object at a time. Google Patents blocks the machine within minutes if you run several at once.
2. Write `lineage.json` and run `node scripts/verify-patents.mjs examples/<name>/lineage.json --drawings` until every ancestor passes. **Fix the lineage, never the check.**
3. Read every sheet in `drawings/` and redraw from the sheet, not from memory. Compare each specimen with its sheet at 4×.
4. Build both themes, run the line check, look at every PNG.
5. Captions say "patented", never "invented". Name any ancestor you could not verify in the caption and the sources, not in the picture.

## House rules

- Kit changes are opt-in and leave every existing example byte-identical.
- No dependencies.
- Every number in a figure, a readout, a caption or the docs is true.

## Pull requests

Fill in the template. Include light and dark screenshots and 4× close-ups of every junction you touched.
