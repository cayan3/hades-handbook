/**
 * Throwaway alongside the fixture, and the reason the fixture is worth
 * anything: five hand-written runs are only a demonstration of five states if
 * the engine agrees they are five states. Without this the sketch would be
 * five labels somebody typed.
 *
 * Node environment, no document — this is the half of the slice that does not
 * need one.
 */

import { createLookups } from "@repo/catalog";
import { boonState } from "@repo/core";
import { createRules } from "@repo/rules-hades1";
import { describe, expect, it } from "vitest";

import { FIXTURES, SUBJECT, prereqOf } from "./fixture.js";

describe("the five-state fixture", () => {
  const rules = createRules();
  const lookups = createLookups("hades1");
  const prereq = prereqOf(SUBJECT);

  it.each(FIXTURES)("puts the subject in $state", ({ state, facts }) => {
    expect(boonState(SUBJECT, prereq, facts, rules, lookups)).toBe(state);
  });
});
