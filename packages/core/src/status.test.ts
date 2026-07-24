import { describe, expect, it } from "vitest";
import type { Reason, Status } from "./index.js";

/**
 * Type-level, compile-type guards over the answer shape. Just like in
 * requirement.test.ts, the failure path is a typecheck error instead of a
 * failed assertion bc `statusKind` and `reasonKind` declare a return type and
 * have no default case, so adding or removing a union member w/o also adding
 * or removing its `case` would break `npm run typecheck`.
 *
 * The three-way split of `Status` is important: "not yet met" & "impossible
 * this run" are separate branches on purpose, & pending carries a residual
 * (remaining requirements user needs to meet) instead of a boolean.
 */

const STATUS_KINDS = ["satisfied", "pending", "unsatisfiable"] as const;

const REASON_KINDS = [
  "godPoolFull",
  "godExcluded",
  "banned",
  "aspectConflict",
  "slotConflict",
  "blockedByTrait",
  "elementCeiling",
  "composite",
] as const;

function statusKind(s: Status): (typeof STATUS_KINDS)[number] {
  switch (s.kind) {
    case "satisfied":
      return "satisfied";
    case "pending":
      return "pending";
    case "unsatisfiable":
      return "unsatisfiable";
  }
}

function reasonKind(r: Reason): (typeof REASON_KINDS)[number] {
  switch (r.kind) {
    case "godPoolFull":
      return "godPoolFull";
    case "godExcluded":
      return "godExcluded";
    case "banned":
      return "banned";
    case "aspectConflict":
      return "aspectConflict";
    case "slotConflict":
      return "slotConflict";
    case "blockedByTrait":
      return "blockedByTrait";
    case "elementCeiling":
      return "elementCeiling";
    case "composite":
      return "composite";
  }
}

const REASON_SAMPLES: ReadonlyArray<readonly [(typeof REASON_KINDS)[number], Reason]> = [
  ["godPoolFull", { kind: "godPoolFull", god: "AphroditeUpgrade" }],
  ["godExcluded", { kind: "godExcluded", god: "HadesUpgrade" }],
  ["banned", { kind: "banned", trait: "ZeusShoutTrait" }],
  [
    "aspectConflict",
    { kind: "aspectConflict", aspect: "AspectOfSelene", trait: "AresSkyFallTrait" },
  ],
  [
    "slotConflict",
    {
      kind: "slotConflict",
      trait: "LightningLanceTrait",
      conflictsWith: "HowlingSoulTrait",
      group: "CastModifiers",
    },
  ],
  [
    "blockedByTrait",
    { kind: "blockedByTrait", trait: "AmmoReclaimTrait", blockedBy: "AmmoReplaceTrait" },
  ],
  ["elementCeiling", { kind: "elementCeiling", element: "Water", needed: 3, max: 2 }],
  ["composite", { kind: "composite", reasons: [] }],
];

describe("Status", () => {
  it.each(STATUS_KINDS)("handles the %s branch", (kind) => {
    const samples: Record<(typeof STATUS_KINDS)[number], Status> = {
      satisfied: { kind: "satisfied" },
      pending: { kind: "pending", residual: { kind: "hasElement", element: "Water", count: 2 } },
      unsatisfiable: { kind: "unsatisfiable", reason: { kind: "banned", trait: "ZeusShoutTrait" } },
    };
    expect(statusKind(samples[kind])).toBe(kind);
  });

  it("carries a residual on pending, not a boolean", () => {
    const s: Status = {
      kind: "pending",
      residual: { kind: "hasSet", set: "HestiaCoreTraits", count: 1 },
    };
    expect(s.kind === "pending" && s.residual.kind).toBe("hasSet");
  });
});

describe("Reason", () => {
  it.each(REASON_SAMPLES)("handles the %s shape", (expected, reason) => {
    expect(reasonKind(reason)).toBe(expected);
  });

  it("covers every kind in the union", () => {
    expect(REASON_SAMPLES.map(([kind]) => kind).sort()).toEqual([...REASON_KINDS].sort());
  });

  it("lets a composite explain a group that was one pick short", () => {
    // E.g. of the failure this guards: a group needing two picks, w/ one
    // alternative still reachable, displaying as just a flat "impossible" bc
    // the reason didn't keep any context abt the shortfall.
    const reason: Reason = {
      kind: "composite",
      reasons: [{ kind: "banned", trait: "ZeusShoutTrait" }],
      needed: 2,
      pendingAlternatives: 1,
    };
    expect(reason).toMatchObject({ needed: 2, pendingAlternatives: 1 });
  });

  it("distinguishes a one-directional block from mutual exclusion", () => {
    const blocked: Reason = {
      kind: "blockedByTrait",
      trait: "AmmoReclaimTrait",
      blockedBy: "AmmoReplaceTrait",
    };
    const exclusive: Reason = {
      kind: "slotConflict",
      trait: "LightningLanceTrait",
      conflictsWith: "HowlingSoulTrait",
      group: "CastModifiers",
    };
    expect(reasonKind(blocked)).not.toBe(reasonKind(exclusive));
  });
});
