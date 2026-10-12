# Finding and proving a lineage

## Where ancestors come from

| Source | Good for | Limits |
|---|---|---|
| **Google Patents pages** (`patents.google.com/patent/<id>/en`) | Verification, drawing sheets, backward and forward citations, CPC codes. No key needed. | No official API and an aggressive rate limit: parallel fetching (several lineages at once) gets the machine a temporary HTTP 503 on every page. Run one verification at a time; the script caches pages in `.patent-cache/` and backs off on 503/429. Pre-1920 metadata is OCR: titles and names are often garbled, and the inventor may be missing (the check falls back to the description text). |
| **Citation graph** (backward references of a modern patent) | Real, examiner-made links between generations. | US patents printed references only from 1947: before that the chain breaks and you rely on classification and history. |
| **CPC classification** (e.g. `A47L` for suction cleaners) | Candidates by technical field across eras. | Old patents were reclassified, so coverage is uneven. |
| **Google Patents Public Data on BigQuery** | Bulk queries by CPC, date and text (free 1 TB/month). | Needs a GCP project; select few columns and set a byte cap, the tables are large. |
| **EPO OPS / Espacenet** | Non-US ancestors (GB, DE, FR), INPADOC families. | Free but needs registration and OAuth. Not wired in yet. |
| **Your own knowledge** | A first list of names and decades. | Never trust a number from memory: it must pass the check. |
| **Google's `xhr/query` search endpoint** | (Don't.) | Undocumented; a handful of queries in a row triggers the "Sorry" block for every page. Find numbers from a modern patent's citations, from a history page, or from one search at a time in a browser. |

## Choosing the march
- Each step adds **one visible trait** to the one before (suction → fan → motor → cyclone → autonomy). Internals that change nothing in the silhouette belong in the caption, not in the row.
- Prefer the patent that first *claimed* the trait over the most famous product.
- If the most important ancestor is not a US patent (Booth, GB, 1901), list it in the sources line and say so, until the EPO path exists.
- 4 to 7 ancestors. Fewer and it is a comparison; more and the row gets crowded.

## `lineage.json`
```json
{
  "subject": "Vacuum cleaner",
  "title": "Descent of the vacuum cleaner",
  "question": "How did a box on wheels learn to breathe, then to think?",
  "ancestors": [
    {
      "id": "US889823A",                 // Google Patents id, kind code included
      "year": 1908,                      // PUBLICATION (grant) year, as in the examples; priority is accepted with a note
      "inventor": "Spangler",            // surname, or assignee for corporate patents
      "title": "carpet sweeper and cleaner",
      "name": "Spangler suction sweeper",
      "trait": "An electric motor on the fan casing drives the fan and the brush",
      "short": "electric motor",         // readout, 1 to 3 words
      "evidence": "Fig. 2: electric motor 2 on top of fan casing 1 …",
      "pose": "upright"                  // crouched | leaning | upright | lying
    }
  ]
}
```
`verify-patents.mjs` adds `url`, `verified`, `problems`, `page` (title, abstract, claim 1 where the page has them, inventors, assignees, dates, status, citation counts, `citesAncestor`) and `sheet` (the drawing sheet file and URL). Design patents (`USD558757S`) are checked like utility patents. Edit text fields in `lineage.json` and merge them with `--text-only`; never edit the verified file by hand.

## Honesty rules
- A failed check is a fact about your list, not about the check.
- "Patented", never "invented". The sources line says so on every page.
- Show the original sheet next to the redraw, always: it is both the citation and the proof.
- Old OCR is evidence of nothing: confirm names and dates on the drawing sheet itself (the McGaffey page says "Ivns"; the sheet says "Ives W. McGaffey").

## Blocks and limits
- One lineage at a time, pages cached in `.patent-cache/`, 1.5 s between requests, back-off of 30 s, 60 s, 120 s… on HTTP 503/429 or a "Sorry" page that comes back with HTTP 200.
- A block exits with code 3 and writes nothing: it is a network condition, not a verdict on your lineage.
- Pre-1971 sheets are rendered from the patent PDF (page 1) with `pdftoppm` when it is installed, because Google's drawing list can start at page 2 for old patents. Modern sheets come from the drawing list, skipping the cover figure (`D00000`).
