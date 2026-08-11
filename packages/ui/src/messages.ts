import type { EditAction, QuarantinedEntry, SourceCondition, UndoableEdit } from "@repo/sync";
import type { Naming } from "./naming.js";

/**
 * The sentences a run's chrome says, as against the ones a node says.
 *
 * `sync` deliberately hands over an action and a subject rather than a
 * sentence, a count rather than an apology, and an `Error` rather than advice —
 * on the ground that a storage package deciding how an apology reads, and in
 * what language, is a package doing somebody else's job. This is that job. It
 * is plain functions for the reason the node text is: they can be argued about
 * and tested without a document near them.
 */

/**
 * The undo offer, e.g. "Marked Storm Lightning".
 *
 * Past tense and no "Undo" in it: the control beside it says that, and a
 * sentence that names its own button reads as one when the button is somewhere
 * else. Where a gesture named nothing — unequipping, accepting a notice — the
 * verb carries it alone.
 */
export function editSentence(edit: UndoableEdit, naming: Naming): string {
  const verb = VERBS[edit.action];
  if (edit.subject === null) return verb;
  return `${verb} ${subjectName(edit, naming)}`;
}

/**
 * Named after the writer, so that the vocabulary here and the vocabulary in the
 * package cannot drift apart. Exhaustive with no default: a writer added there
 * fails the typecheck here rather than shipping a toast that says nothing.
 */
const VERBS: Readonly<Record<EditAction, string>> = {
  mark: "Marked",
  remove: "Removed",
  purge: "Purged",
  addGod: "Added",
  equipWeapon: "Changed weapon",
  equipAspect: "Changed aspect",
  equipKeepsake: "Changed keepsake",
  answerMirrorRow: "Answered the Mirror row",
  answerTalent: "Answered",
  setElement: "Set",
  setResource: "Set",
  pin: "Pinned",
  unpin: "Unpinned",
  plan: "Planned",
  unplan: "Unplanned",
  setNote: "Noted",
  acceptMigration: "Dismissed the update notice",
};

/**
 * A subject is a trait id for most writers and something else for the rest — a
 * god, an element, a resource, a Mirror row — none of which the trait resolver
 * can name. Asking it anyway would print a trait's display name over a god.
 */
function subjectName(edit: UndoableEdit, naming: Naming): string {
  const subject = edit.subject ?? "";
  switch (edit.action) {
    case "mark":
    case "remove":
    case "purge":
    case "pin":
    case "unpin":
    case "plan":
    case "unplan":
    case "setNote":
    case "equipAspect":
      return naming.trait(subject);
    case "addGod":
      return naming.god(subject);
    case "equipKeepsake":
      return naming.keepsake(subject);
    case "answerTalent":
      return naming.talent(subject);
    // A weapon, a Mirror row, an element and a resource are already the word
    // the player uses; the last two never reach here, having no subject.
    case "equipWeapon":
    case "answerMirrorRow":
    case "setElement":
    case "setResource":
    case "acceptMigration":
      return subject;
  }
}

/** What a load could not carry forward, and what the player can do about it. */
export interface MigrationMessage {
  readonly title: string;
  readonly body: string;
  /** The player's own words, which are the only part worth showing verbatim. */
  readonly notes: readonly string[];
}

/**
 * The one place a count becomes an apology.
 *
 * The entries are listed by kind and not by id, because a trait id is the
 * game's internal string and a player has never seen one — and the ids in a
 * notice are precisely the ones the catalog can no longer put a name to, so
 * there is nothing to resolve them into. Notes are the exception and are shown
 * in full: a note is the only thing in a run the player wrote themselves, and
 * losing it silently is the one loss this whole mechanism exists to prevent.
 */
export function migrationMessage(
  count: number,
  entries: readonly QuarantinedEntry[],
): MigrationMessage {
  const notes = entries
    .filter((entry): entry is Extract<QuarantinedEntry, { path: "notes" }> => entry.path === "notes")
    .map((entry) => entry.value);

  return {
    title: "This run predates a game update.",
    body:
      count === 1
        ? "One entry couldn't be matched to the current data and has been set aside."
        : `${count} entries couldn't be matched to the current data and have been set aside.`,
    notes,
  };
}

/**
 * Why the run on screen is empty when the player did not empty it.
 *
 * The cause is an `Error` written for whoever has to fix it, so it is offered
 * rather than led with: what a player needs first is that the old run was kept
 * and this one is new, which is the part that decides whether they close the
 * tab in a panic.
 */
export const UNREADABLE_RUN_TITLE = "Your saved run couldn't be opened.";
export const UNREADABLE_RUN_BODY =
  "It has been kept exactly as it was rather than deleted, and this run started fresh. " +
  "A later version of the Handbook may be able to read it.";

/**
 * The difference between a run that is not being saved and one that looks fine.
 *
 * "Keep playing" is the load-bearing half. Every edit is still accepted and
 * every answer on screen is still right; what is at risk is only the reload,
 * and a message that reads like a crash would cost a run the player still has.
 */
export const STORAGE_ERROR_TITLE = "This run isn't being saved.";
export const STORAGE_ERROR_BODY =
  "Keep playing — everything on screen is still right. It just won't survive a reload " +
  "until saving works again. Storage can be blocked in a private window, or full.";

/**
 * Two tabs of the same origin share one database and write last-one-wins, and
 * v1 does not coordinate them. Saying which tab to keep is the whole mitigation,
 * so the sentence has to name the action rather than describe the hazard.
 */
export const OTHER_TAB_TITLE = "This run is open in another tab.";
export const OTHER_TAB_BODY =
  "Whichever tab saves last wins, so close the others before you carry on.";

/** A "diverges from live" marker, per field, never a mode the run is in. */
export const OVERRIDDEN_LABEL = "Held by hand";
export const OVERRIDDEN_HINT = "You set this yourself. It won't be updated for you.";

/** The three removals, whose difference is a fact about the run rather than wording. */
export const REMOVE_LABEL = "I mis-tapped";
export const REMOVE_HINT = "It never happened. The god leaves the pool if nothing else holds them.";
export const PURGE_LABEL = "I lost it in game";
export const PURGE_HINT = "You had it, so the god stays in the pool.";

/** Whether anything in the source's condition is worth interrupting for. */
export function hasSomethingToSay(condition: SourceCondition): boolean {
  return (
    condition.migrationNotice !== null ||
    condition.unreadableRun !== null ||
    condition.storageError !== null
  );
}
