# Changelog

All notable changes to Patent lineage are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The skill has no version numbers yet, so entries are dated.

## [Unreleased]

### Added

- The skill: find a product's patented ancestors, verify them against Google Patents, read each patent's drawing sheet and redraw the ancestors as interactive isometric specimens floating above a minimal timeline, with each ancestor's claimed trait lit.
- `scripts/verify-patents.mjs`: checks number (design patents included), year, inventor and title, with OCR fallbacks for 1800s patents; paced and cached; detects Google's block (including a "Sorry" page returned with HTTP 200) and exits with code 3 without writing; renders sheet 1 from the PDF for pre-1971 patents; skips the cover figure for modern ones; rejects placeholder text; `--text-only` merges edited text without a network request.
- `scripts/patent-id.mjs`, with tests.
- `↓ png` and `↓ svg` buttons: the figure as shown, on the card background, with its title; drawing sheets embedded in the page (selected one plus a gallery of all), so pages are self-contained.
- `examples/vacuum-cleaner/`, `examples/computer-mouse/` (cutaways, magnified) and `examples/typewriter/` (dense, with a gap).
- Packaging: README, CONTRIBUTING, CODE_OF_CONDUCT, SECURITY, issue and pull request templates, CI, `evals/evals.json`, `agents/openai.yaml`.

### Known limits

- US patents only.
- The typewriter lineage has four ancestors: the front-strike step could not be verified before Google rate-limited the machine.
- Specimens are small at 390 px wide; the readout and the sheet panel carry the message there.
