import type { Rarity, TraitId } from "@repo/core";
import { type CSSProperties, useState } from "react";
import type { NodeView } from "./node-view.js";
import { byLadder, rarityColour } from "./rarity-palette.js";

/**
 * The gestures a surface can offer about one boon.
 *
 * **The two removals are separate verbs because the difference is a fact about
 * the run, not wording.** A mis-tap never happened, so the god goes back out of
 * the pool if nothing else holds them there; a boon lost in game was really
 * taken, so the god stays. What a surface *offers* is a second question: the
 * two only ever differ on the last boon a god has left, so both are asked there
 * and a plain Remove is drawn everywhere else. It takes the god-stays branch,
 * because the other one under-reports the pool for the rest of the run — a god
 * the player has met reading as one they have not.
 *
 * Displacement is the third and is not a gesture at all: it happens on its own
 * when a mark fills an occupied slot. It is announced before the mark rather
 * than offered as a choice, because refusing it would mean refusing ordinary
 * play.
 */
export interface BoonActions {
  /**
   * Records the boon as held. The rarity is what the player was offered, or
   * `null` where the data declares none and there was nothing to ask.
   */
  readonly mark?: (trait: TraitId, rarity: Rarity | null) => void;
  /**
   * A mis-tap: it never happened. The pool is worked out rather than dictated —
   * a god stays where anything else still holds them there.
   *
   * `fromPool` says otherwise outright, for the one control that names the pool
   * in its own label. Without it a god purged earlier in the run could never be
   * taken back out, whatever the player chose.
   */
  readonly remove?: (trait: TraitId, options?: { readonly fromPool?: boolean }) => void;
  /** Held, and then lost in game. */
  readonly purge?: (trait: TraitId) => void;
  readonly pin?: (trait: TraitId) => void;
  readonly unpin?: (trait: TraitId) => void;
  /** Hands this boon's held state back to the source, which repopulates it. */
  readonly clearOverride?: (trait: TraitId) => void;
}

/**
 * The write path, and the shape of the questions it asks.
 *
 * **The sheet is where the fiddly edits live, and a held boon is the only thing
 * that has any.** Marking is a tap on the node itself and setting a goal is a
 * long press on it, because those two are what a player does dozens of times a
 * run and neither can afford a dialog in front of it. What is left is the rest:
 * correcting a mis-tap, recording a loss, and saying which rarity the boon
 * actually came at.
 *
 * **Rarity is one control per rarity**, where the record declares any, so the
 * answer is the tap rather than a tap and then a question. It corrects what the
 * mark had to guess: a one-tap mark stores the first rarity the record
 * declares, which is Common for most boons and therefore draws no colour, and
 * this is where a player says otherwise.
 */
export function BoonActionBar({
  view,
  held,
  pinned,
  alone = false,
  actions,
}: {
  readonly view: NodeView;
  readonly held: boolean;
  readonly pinned: boolean;
  /**
   * Whether this is the last boon the run still holds from its god, which is
   * the only case where the two removals differ. The surface knows it; this
   * component sees one boon and cannot.
   */
  readonly alone?: boolean;
  readonly actions: BoonActions;
}) {
  const { mark, remove, purge, pin, unpin } = actions;
  /* Whether Remove has been pressed on the one boon where it has a question to
     ask. Reset by the sheet closing, which unmounts this. */
  const [asking, setAsking] = useState(false);
  // The ladder rather than the record's own order, which is alphabetical. The
  // order is a fact about rarities, so it is the same list the card's menu
  // draws; the colour on each choice is that menu's own.
  const rarities = byLadder(view.rarities);
  const marking = !held && mark !== undefined;
  const rerarity = held && mark !== undefined && view.rarities.length > 0;
  const removing = held && (remove !== undefined || purge !== undefined);
  // A form is not a goal: a goal is something to go and collect, and you start
  // the run with the form you chose.
  const pinning = !view.aspect && (pinned ? unpin !== undefined : pin !== undefined);
  /**
   * What a plain Remove does. A record filed under a weapon has no god, so
   * `purge` — which exists to leave one in the pool — is the wrong half of the
   * pair for it. The Loadout settles it the same way.
   */
  const takeOff = view.weapon !== null ? remove : purge;
  /* The pool question is only worth asking on the last boon a god has left, and
     only where there is a god and both answers are on offer. */
  const pooling =
    alone && view.weapon === null && remove !== undefined && purge !== undefined;
  if (!marking && !rerarity && !removing && !pinning) return null;

  return (
    <div className="sheet__actions">
      {!marking ? null : view.rarities.length === 0 ? (
        <button type="button" onClick={() => mark?.(view.trait, null)}>
          Mark as have
        </button>
      ) : (
        <fieldset className="sheet__rarities">
          <legend>Mark as have, at</legend>
          {rarities.map((rarity) => (
            <button
              key={rarity}
              type="button"
              // The colour it will paint, the same as the card's own menu: the
              // word and its outline both, so a rarity reads as itself here too.
              style={{ "--choice": rarityColour(rarity) } as CSSProperties}
              onClick={() => mark?.(view.trait, rarity)}
            >
              {rarity}
            </button>
          ))}
        </fieldset>
      )}

      {!rerarity ? null : (
        <fieldset className="sheet__rarities">
          {/* The mark itself could not ask, being one tap. This is the answer
              arriving late rather than a question nobody was asked. */}
          <legend>Taken at</legend>
          {rarities.map((rarity) => (
            <button
              key={rarity}
              type="button"
              aria-pressed={view.rarity === rarity}
              style={{ "--choice": rarityColour(rarity) } as CSSProperties}
              onClick={() => mark?.(view.trait, rarity)}
            >
              {rarity}
            </button>
          ))}
        </fieldset>
      )}

      {!removing ? null : (
        <fieldset className="sheet__removals">
          <legend>No longer have it?</legend>
          {!asking || !pooling ? (
            /* One control, which is the Loadout's rule arriving here: the two
               removals only ever differ on the last boon a god has left, and
               offering both everywhere else asked a question with one answer
               under two names. Plain Remove leaves the god in the pool — a god
               you have met is one you have met, whatever became of the boon. */
            <button
              type="button"
              onClick={() => (pooling ? setAsking(true) : takeOff?.(view.trait))}
            >
              Remove
            </button>
          ) : (
            <>
              <button type="button" onClick={() => purge?.(view.trait)}>
                Remove boon only
              </button>
              {/* Named in the label, so it is said outright rather than
                  inferred: a god purged earlier in the run is still one the
                  player can take out here. */}
              <button type="button" onClick={() => remove?.(view.trait, { fromPool: true })}>
                Remove boon and god from pool
              </button>
            </>
          )}
        </fieldset>
      )}

      {!pinning ? null : pinned ? (
        <button type="button" onClick={() => unpin?.(view.trait)}>
          Remove goal
        </button>
      ) : (
        <button type="button" onClick={() => pin?.(view.trait)}>
          Set as goal
        </button>
      )}
    </div>
  );
}
