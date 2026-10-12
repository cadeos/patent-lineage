import { readFileSync, writeFileSync, mkdirSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { samePatent } from "./patent-id.mjs";

const argv = process.argv.slice(2);
const file = argv.find((arg) => !arg.startsWith("--"));
const fetchDrawings = argv.includes("--drawings");
const textOnly = argv.includes("--text-only");
if (!file) {
  console.error("usage: node scripts/verify-patents.mjs lineage.json [--drawings] [--text-only]");
  console.error("  --drawings   also save sheet 1 of each verified patent to drawings/");
  console.error("  --text-only  merge edited text fields into lineage.verified.json without any network request");
  process.exit(2);
}

const lineage = JSON.parse(readFileSync(file, "utf8"));
const here = dirname(file);
const out = join(here, "lineage.verified.json");
const CACHE = join(here, ".patent-cache");
const TEXT_FIELDS = ["name", "trait", "short", "evidence", "pose"];
const PLACEHOLDER = /^\s*(tbd|todo|xxx|\?+|n\/a|\.\.\.|…)?\s*$/i;

const decode = (text) => text.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
const fold = (text) => decode(String(text)).toLowerCase().normalize("NFKD").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const near = (a, b) => {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const keep = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = keep;
    }
  }
  return row[b.length] <= Math.max(1, Math.floor(b.length / 4));
};
const all = (html, re) => [...html.matchAll(re)].map((match) => decode(match[1]));
const pause = (ms) => new Promise((done) => setTimeout(done, ms));

function textProblems(entry) {
  const problems = [];
  for (const field of ["name", "trait", "short", "evidence"]) {
    if (typeof entry[field] !== "string" || PLACEHOLDER.test(entry[field])) problems.push(`${field}: missing or a placeholder`);
  }
  return problems;
}

if (textOnly) {
  if (!existsSync(out)) {
    console.error(`${out} does not exist: run the full check once first`);
    process.exit(2);
  }
  const verified = JSON.parse(readFileSync(out, "utf8"));
  let bad = 0;
  for (const entry of lineage.ancestors) {
    const found = verified.ancestors.find((item) => item.id === entry.id);
    const problems = textProblems(entry);
    if (!found) problems.push("not in lineage.verified.json: verify it first");
    if (problems.length) { bad += 1; console.log(`FAIL ${entry.id}\n     ${problems.join("\n     ")}`); continue; }
    for (const field of TEXT_FIELDS) if (entry[field] !== undefined) found[field] = entry[field];
    console.log(`ok   ${entry.id} text merged`);
  }
  for (const key of ["subject", "title", "question"]) if (lineage[key] !== undefined) verified[key] = lineage[key];
  if (!bad) writeFileSync(out, JSON.stringify(verified, null, 2));
  process.exit(bad ? 1 : 0);
}

const isBlocked = (html) => !/<meta name="citation_patent_number"|itemprop="title"|<meta name="DC\.title"/.test(html) || /\/sorry\/|unusual traffic|Our systems have detected/i.test(html);

async function politeFetch(url, binary = false) {
  for (let attempt = 0; attempt < 5; attempt++) {
    let response = null;
    try {
      response = await fetch(url, { headers: { "user-agent": "patent-lineage/0.1 (patent lineage check)" } });
    } catch (error) {
      throw Object.assign(new Error(`network error: ${error.message}`), { network: true });
    }
    if (response.ok) {
      const body = binary ? Buffer.from(await response.arrayBuffer()) : await response.text();
      if (!binary && isBlocked(body)) { /* a "Sorry" page can come back with HTTP 200 */ }
      else { await pause(1500); return body; }
    } else if (response.status !== 429 && response.status !== 503) {
      throw new Error(`HTTP ${response.status}`);
    }
    const wait = 30000 * 2 ** attempt;
    console.error(`     Google Patents is rate-limiting this machine: waiting ${wait / 1000}s before retry ${attempt + 1}/5`);
    await pause(wait);
  }
  throw Object.assign(new Error("rate-limited by Google Patents after 5 retries: this is not a lineage error. Wait a few minutes and run again; never run several verifications in parallel"), { network: true });
}

async function page(id) {
  const url = `https://patents.google.com/patent/${id}/en`;
  const cached = join(CACHE, `${id}.html`);
  if (existsSync(cached)) {
    const html = readFileSync(cached, "utf8");
    if (!isBlocked(html)) return { url, html };
  }
  const html = await politeFetch(url);
  mkdirSync(CACHE, { recursive: true });
  writeFileSync(cached, html);
  return { url, html };
}

function facts(full) {
  const cut = full.indexOf("<h2>Description</h2>");
  const html = cut > 0 ? full.slice(0, cut) : full;
  const section = (name) => decode((full.match(new RegExp(`<section itemprop="${name}"[\\s\\S]*?</section>`)) || [""])[0].replace(/<[^>]+>/g, " "));
  const description = section("description").slice(0, 1500);
  const abstract = section("abstract").slice(0, 600) || decode((full.match(/<meta name="DC.description" content="([^"]*)"/) || [])[1] || "");
  const claim = decode((full.match(/<div[^>]*class="claim"[\s\S]*?<\/div>\s*<\/div>/) || full.match(/<div[^>]*class="claim-text"[\s\S]*?<\/div>/) || [""])[0].replace(/<[^>]+>/g, " ")).slice(0, 700);
  const title = (html.match(/<meta name="DC.title" content="([^"]*)"/) || html.match(/<title>[^-]*-\s*([^<]*?)\s*-\s*Google Patents<\/title>/) || [])[1] || "";
  const number = (html.match(/<meta name="citation_patent_number" content="([^"]+)"/) || [])[1] || "";
  const inventors = [...all(html, /itemprop="inventor"[^>]*>([^<]+)</g), ...all(html, /<meta name="DC.contributor" content="([^"]+)"/g)];
  const assignees = all(html, /itemprop="assigneeOriginal"[^>]*>([^<]+)</g);
  const date = (prop) => (html.match(new RegExp(`itemprop="${prop}" datetime="([0-9-]+)"`)) || [])[1] || "";
  const dc = all(html, /<meta name="DC.date" content="([0-9-]+)"/g).sort();
  const published = date("publicationDate") || dc.pop() || "";
  const priority = date("priorityDate") || dc[0] || "";
  const status = (html.match(/itemprop="status">([^<]+)</) || [])[1] || "";
  const drawings = [...new Set(all(full, /(https:\/\/patentimages\.storage\.googleapis\.com\/[^"]+\.png)/g))];
  const pdf = (full.match(/(https:\/\/patentimages\.storage\.googleapis\.com\/[^"]+\.pdf)/) || [])[1] || "";
  const cites = [...new Set(all(full, /itemprop="backwardReferences(?:Orig)?"[\s\S]*?itemprop="publicationNumber"[^>]*>([^<]+)</g))];
  const citedBy = [...new Set(all(full, /itemprop="forwardReferences(?:Orig)?"[\s\S]*?itemprop="publicationNumber"[^>]*>([^<]+)</g))];
  return { description, abstract, claim, pdf, title: decode(title), number, inventors: [...new Set(inventors)], assignees, published, priority, status: decode(status), drawings, cites, citedBy };
}

const report = [];
let failed = 0;
let blocked = 0;
const seen = [];
for (const entry of lineage.ancestors) {
  const problems = textProblems(entry);
  let got = null;
  let url = "";
  try {
    const result = await page(entry.id);
    url = result.url;
    got = facts(result.html);
  } catch (error) {
    problems.push(String(error.message || error));
    if (error.network) blocked += 1;
  }
  const notes = [];
  if (got) {
    if (!samePatent(entry.id, got.number)) problems.push(`number: page says ${got.number || "nothing"}`);
    const years = [got.published, got.priority].map((date) => Number(date.slice(0, 4))).filter(Boolean);
    if (!years.includes(entry.year)) problems.push(`year: claimed ${entry.year}, page has priority ${got.priority || "?"} and publication ${got.published || "?"}`);
    else if (Number(got.published.slice(0, 4)) !== entry.year) notes.push(`year ${entry.year} is the priority year; the publication year is ${got.published.slice(0, 4)} (the examples show the publication year)`);
    const people = fold([...got.inventors, ...got.assignees].join(" "));
    const named = fold(entry.inventor);
    const ocr = fold(got.description).split(" ");
    if (!people.includes(named) && ocr.some((word) => near(word, named))) got.inventors.push(`${entry.inventor} (from the OCR text)`);
    else if (!people.includes(named)) problems.push(`inventor: claimed "${entry.inventor}", page lists "${[...got.inventors, ...got.assignees].join("; ") || "nobody"}" (old patents are OCR text: check the drawing sheet)`);
    const claimed = fold(entry.title || "").split(" ").filter((word) => word.length > 3);
    const titleWords = fold(got.title).split(" ");
    const inTitle = claimed.some((word) => titleWords.some((have) => near(have, word)));
    if (entry.title && claimed.length && !inTitle) {
      if (claimed.every((word) => ocr.some((have) => near(have, word)))) got.title += ` [OCR page title; "${entry.title}" found in the text]`;
      else problems.push(`title: claimed "${entry.title}", page says "${got.title}"`);
    }
    if (!got.drawings.length) problems.push("no drawing sheets found");
  }
  const citesAncestor = got ? seen.filter((id) => got.cites.some((cite) => samePatent(id, cite.replace(/[^A-Za-z0-9]/g, "")))) : [];
  seen.push(entry.id);
  if (problems.length) failed += 1;
  report.push({
    ...entry,
    url,
    pdf: got ? got.pdf : "",
    verified: problems.length === 0,
    problems,
    page: got && { title: got.title, abstract: got.abstract, claim1: got.claim, inventors: got.inventors, assignees: got.assignees, priority: got.priority, published: got.published, status: got.status, cites: got.cites.length, citedBy: got.citedBy.length, citesAncestor },
    drawings: got ? got.drawings : [],
  });
  const summary = got ? ` · "${got.title}" · cites ${got.cites.length}, cited by ${got.citedBy.length}${citesAncestor.length ? " · cites ancestor " + citesAncestor.join(", ") : ""}` : "";
  console.log(`${problems.length ? "FAIL" : "ok  "} ${entry.id} ${entry.year} ${entry.inventor}${problems.length ? "\n     " + problems.join("\n     ") : summary}${notes.length ? "\n     note: " + notes.join("; ") : ""}`);
}

if (blocked) {
  console.error(`\n${blocked} of ${report.length} ancestors could not be fetched (rate limit or network): ${out} was NOT written. This is not a lineage error.`);
  process.exit(3);
}

if (fetchDrawings) {
  const dir = join(here, "drawings");
  mkdirSync(dir, { recursive: true });
  const pageOf = (url) => Number((url.match(/(?:page-|D000)(\d+)\.png/) || [])[1] ?? 99);
  for (const entry of report) {
    if (!entry.verified) { console.log(`     sheet ${entry.id}: not downloaded (not verified)`); continue; }
    let best = null;
    const year = Number(((entry.page && entry.page.published) || "").slice(0, 4));
    if (entry.pdf && year && year < 1971) {
      try {
        const cachedPdf = join(CACHE, `${entry.id}.pdf`);
        if (!existsSync(cachedPdf)) { mkdirSync(CACHE, { recursive: true }); writeFileSync(cachedPdf, await politeFetch(entry.pdf, true)); }
        const work = mkdtempSync(join(tmpdir(), "sheet-"));
        try {
          execFileSync("pdftoppm", ["-r", "150", "-png", "-f", "1", "-l", "1", "-singlefile", cachedPdf, join(work, "s")]);
          best = { url: entry.pdf + "#page=1", buffer: readFileSync(join(work, "s.png")) };
        } finally {
          rmSync(work, { recursive: true, force: true });
        }
      } catch (error) {
        console.log(`     ${entry.id}: could not render PDF page 1 (${String(error.message).split("\n")[0]}); falling back to Google's drawing list, check that it is really sheet 1`);
      }
    }
    if (!best) {
      const pages = entry.drawings.map(pageOf);
      const real = pages.filter((n) => n > 0);
      const first = Math.min(...(real.length ? real : pages));
      for (const url of entry.drawings.filter((u) => pageOf(u) === first)) {
        const buffer = await politeFetch(url, true);
        if (!best || buffer.length > best.buffer.length) best = { url, buffer };
      }
    }
    if (best) {
      const name = `${entry.id}-sheet1.png`;
      writeFileSync(join(dir, name), best.buffer);
      entry.sheet = { file: `drawings/${name}`, url: best.url };
      console.log(`     sheet ${entry.id} -> drawings/${name} (${Math.round(best.buffer.length / 1024)} KB): read it before you draw`);
    }
  }
}

writeFileSync(out, JSON.stringify({ ...lineage, checked: new Date().toISOString(), ancestors: report.map(({ drawings, ...rest }) => rest) }, null, 2));
console.log(failed ? `\n${failed} of ${report.length} ancestors FAILED: fix lineage.json, never the check` : `\nall ${report.length} ancestors verified -> ${out}`);
process.exit(failed ? 1 : 0);
