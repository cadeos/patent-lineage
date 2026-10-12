import test from "node:test";
import assert from "node:assert/strict";
import { parseId, formatNumber, samePatent } from "./patent-id.mjs";

test("formats utility, padded and design ids", () => {
  assert.equal(formatNumber("US889823A"), "US 889,823");
  assert.equal(formatNumber("US06594844B2"), "US 6,594,844");
  assert.equal(formatNumber("USD558757S1"), "US D558,757");
});

test("compares an id with a page number exactly", () => {
  assert.ok(samePatent("US29077A", "US:29077"));
  assert.ok(!samePatent("US29077A", "US:290777"));
  assert.ok(samePatent("USD558757S", "US:D558757"));
  assert.ok(!samePatent("US558757A", "US:D558757"));
});

test("rejects things that are not ids", () => {
  assert.equal(parseId("not an id"), null);
});
