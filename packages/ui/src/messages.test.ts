import type { QuarantinedEntry, UndoableEdit } from "@repo/sync";
import { describe, expect, it } from "vitest";
import type { Naming } from "./naming.js";
import { editSentence, hasSomethingToSay, migrationMessage } from "./messages.js";

/**
 * Made-up names, so that an assertion here is about the sentence rather than
 * about the extraction. Each resolver answers differently, which is what makes
 * "the toast asked the wrong one" visible.
 */
const naming: Naming = {
  trait: (id) => `trait:${id}`,
  god: (id) => `god:${id}`,
  keepsake: (id) => `keepsake:${id}`,
  talent: (id) => `talent:${id}`,
  aspect: (id) => `aspect:${id}`,
};

const edit = (over: Partial<UndoableEdit>): UndoableEdit => ({
  action: "mark",
  subject: "StormLightning",
  ...over,
});

describe("the undo offer", () => {
  it("names the writer in the past tense without naming its own button", () => {
    expect(editSentence(edit({}), naming)).toBe("Marked trait:StormLightning");
    expect(editSentence(edit({ action: "purge" }), naming)).toBe("Purged trait:StormLightning");
  });

  /**
   * A subject is a trait for most writers and something else for the rest. Ask
   * the wrong resolver and a god's name comes back as a boon's, which is the
   * kind of wrong that reads as merely odd.
   */
  it("resolves each subject in its own id space", () => {
    expect(editSentence(edit({ action: "addGod", subject: "Hera" }), naming)).toBe("Added god:Hera");
    expect(editSentence(edit({ action: "equipKeepsake", subject: "Frog" }), naming)).toBe(
      "Changed keepsake keepsake:Frog",
    );
    expect(editSentence(edit({ action: "answerTalent", subject: "Ammo" }), naming)).toBe(
      "Answered talent:Ammo",
    );
  });

  it("stands on the verb alone where the gesture named nothing", () => {
    expect(editSentence(edit({ action: "acceptMigration", subject: null }), naming)).toBe(
      "Dismissed the update notice",
    );
    expect(editSentence(edit({ action: "equipKeepsake", subject: null }), naming)).toBe(
      "Changed keepsake",
    );
  });
});

describe("the migration notice", () => {
  const note = (text: string): QuarantinedEntry => ({
    path: "notes",
    key: "GoneTrait",
    value: text,
  });
  const boon: QuarantinedEntry = {
    path: "held",
    key: "GoneTrait",
    value: { rarity: "Common", level: 1 },
  };

  it("counts in words a player would use", () => {
    expect(migrationMessage(1, [boon]).body).toContain("One entry");
    expect(migrationMessage(3, [boon]).body).toContain("3 entries");
  });

  /**
   * The ids in a notice are exactly the ones the catalog can no longer name, so
   * there is nothing to resolve them into — but a note is the player's own
   * sentence, and losing that silently is what the whole mechanism exists to
   * prevent.
   */
  it("shows the player's own words and nothing else verbatim", () => {
    const message = migrationMessage(2, [boon, note("save this for the Hera duo")]);
    expect(message.notes).toEqual(["save this for the Hera duo"]);
  });
});

describe("whether there is anything to interrupt for", () => {
  const quiet = {
    migrationNotice: null,
    unreadableRun: null,
    storageError: null,
    quarantine: [],
    lastEdit: null,
  };

  it("ignores an edit and a quarantine that nobody is owed an explanation for", () => {
    expect(hasSomethingToSay(quiet)).toBe(false);
    expect(
      hasSomethingToSay({
        ...quiet,
        quarantine: [boonEntry],
        lastEdit: { action: "mark", subject: "X" },
      }),
    ).toBe(false);
  });

  it("speaks up for a failed save, an unreadable run and an owed notice", () => {
    expect(hasSomethingToSay({ ...quiet, storageError: new Error("quota") })).toBe(true);
    expect(hasSomethingToSay({ ...quiet, unreadableRun: new Error("truncated") })).toBe(true);
    expect(
      hasSomethingToSay({
        ...quiet,
        migrationNotice: { count: 1, entries: [], playedOn: "a", now: "b" },
      }),
    ).toBe(true);
  });
});

const boonEntry: QuarantinedEntry = {
  path: "held",
  key: "GoneTrait",
  value: { rarity: "Common", level: 1 },
};
