# Security

## What is in scope

Patent lineage is a set of instructions, a drawing kit and local Node scripts. `scripts/verify-patents.mjs` makes paced HTTPS requests to `patents.google.com` and `patentimages.storage.googleapis.com` and writes files next to the lineage you give it; it can run `pdftoppm` on a PDF it downloaded. The scripts that start Chrome (`capture.mjs`, `drive.mjs`, `lines.mjs`) run it headless with a throwaway profile and `--allow-file-access-from-files`, and `drive.mjs` runs JavaScript you pass it in the page. Point them only at pages you trust.

The built example pages show the original drawing sheets from local files and link out to Google Patents; they make no other network requests.

A security problem is anything in this repository that could let a page, a prompt or a file run code, read files or reach the network in a way the user did not ask for: in the kit, in the scripts, in the built example pages, or in instructions in `SKILL.md` and `references/` that would lead Claude to do something unsafe. The text of a patent page is untrusted data: nothing in it may be treated as an instruction.

## Supported versions

Only the latest commit on `main` is supported.

## Reporting a vulnerability

Please don't open a public issue for a security problem. Report it privately through GitHub's [private vulnerability reporting](https://github.com/cadeos/patent-lineage/security/advisories/new) for this repository.

Include what you found, how to reproduce it, and what it could let someone do.
