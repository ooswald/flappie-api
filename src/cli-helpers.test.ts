import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  POLICIES,
  parseBool,
  normalizePolicy,
  parseWeekdays,
  summarizeSettings,
} from "./cli-helpers.ts";

describe("parseBool", () => {
  it("accepts truthy spellings", () => {
    for (const v of ["on", "true", "1", "yes", "ON", "True", "YES"]) {
      assert.equal(parseBool(v), true, `"${v}" should be true`);
    }
  });

  it("accepts falsy spellings", () => {
    for (const v of ["off", "false", "0", "no", "OFF", "False", "NO"]) {
      assert.equal(parseBool(v), false, `"${v}" should be false`);
    }
  });

  it("passes booleans through", () => {
    assert.equal(parseBool(true), true);
    assert.equal(parseBool(false), false);
  });

  it("throws on garbage", () => {
    assert.throws(() => parseBool("maybe"), /expected on\/off/);
    assert.throws(() => parseBool(""), /expected on\/off/);
    assert.throws(() => parseBool(undefined), /expected on\/off/);
  });
});

describe("normalizePolicy", () => {
  it("returns each canonical value unchanged", () => {
    for (const p of POLICIES) assert.equal(normalizePolicy(p), p);
  });

  it("uppercases lowercase input", () => {
    assert.equal(normalizePolicy("open"), "OPEN");
    assert.equal(normalizePolicy("closed"), "CLOSED");
  });

  it("converts dashes to underscores (so the CLI accepts open-in)", () => {
    assert.equal(normalizePolicy("open-in"), "OPEN_IN");
    assert.equal(normalizePolicy("open-out"), "OPEN_OUT");
    assert.equal(normalizePolicy("Open-Out"), "OPEN_OUT");
  });

  it("throws on unknown policies", () => {
    assert.throws(() => normalizePolicy("ajar"), /policy must be one of/);
    assert.throws(() => normalizePolicy(""), /policy must be one of/);
    assert.throws(() => normalizePolicy("OPEN_BACKWARDS"), /policy must be one of/);
  });
});

describe("parseWeekdays", () => {
  it("expands shortcuts", () => {
    assert.deepEqual(parseWeekdays("all"), [1, 2, 3, 4, 5, 6, 7]);
    assert.deepEqual(parseWeekdays("every"), [1, 2, 3, 4, 5, 6, 7]);
    assert.deepEqual(parseWeekdays(""), [1, 2, 3, 4, 5, 6, 7]);
    assert.deepEqual(parseWeekdays("weekdays"), [1, 2, 3, 4, 5]);
    assert.deepEqual(parseWeekdays("weekend"), [6, 7]);
  });

  it("parses comma-separated three-letter abbreviations (case insensitive)", () => {
    assert.deepEqual(parseWeekdays("mon,wed,fri"), [1, 3, 5]);
    assert.deepEqual(parseWeekdays("Mon, Wed, Fri"), [1, 3, 5]);
    assert.deepEqual(parseWeekdays("monday,saturday"), [1, 6]);
  });

  it("accepts ISO numbers 1..7", () => {
    assert.deepEqual(parseWeekdays("1,3,5"), [1, 3, 5]);
    assert.deepEqual(parseWeekdays("7"), [7]);
  });

  it("accepts a mix of names and numbers", () => {
    assert.deepEqual(parseWeekdays("mon,2,wed"), [1, 2, 3]);
  });

  it("rejects bogus tokens with a helpful message", () => {
    assert.throws(() => parseWeekdays("funday"), /unknown weekday: "funday"/);
    assert.throws(() => parseWeekdays("0"), /unknown weekday: "0"/);
    assert.throws(() => parseWeekdays("8"), /unknown weekday: "8"/);
    assert.throws(() => parseWeekdays("mon,nope"), /unknown weekday: "nope"/);
  });
});

describe("summarizeSettings", () => {
  it("returns empty string for null-ish input", () => {
    assert.equal(summarizeSettings(undefined), "");
    assert.equal(summarizeSettings({}), "");
  });

  it("emits each known field if present", () => {
    assert.equal(
      summarizeSettings({
        open_status: "CLOSED",
        buttons_enabled: false,
        prey_detection_user_preference: true,
        prey_detection_system_lock: true,
      }),
      "open=CLOSED buttons=off ai=on sys-locked",
    );
  });

  it("omits buttons/ai when not booleans", () => {
    assert.equal(
      summarizeSettings({ open_status: "OPEN" }),
      "open=OPEN",
    );
  });

  it("omits sys-locked when the flag is false", () => {
    assert.equal(
      summarizeSettings({
        open_status: "OPEN",
        prey_detection_system_lock: false,
      }),
      "open=OPEN",
    );
  });

  it("renders booleans correctly even when false", () => {
    // false values for buttons_enabled / prey_detection_user_preference must
    // still render as "off" - they're meaningful state, not absence
    assert.equal(
      summarizeSettings({ buttons_enabled: false, prey_detection_user_preference: false }),
      "buttons=off ai=off",
    );
  });
});
