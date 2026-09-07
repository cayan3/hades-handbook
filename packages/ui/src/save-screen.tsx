import type { SaveSlot } from "@repo/sync";
import { type CSSProperties, useId, useState } from "react";
import { chromeStyle } from "./boon-art.js";
import { useDialog } from "./dialog.js";
import { useGame } from "./presentation.js";

/**
 * The door into a game, drawn the way both games draw theirs: three slots and a
 * row that starts a run. Nothing is filed over anything — the run you leave
 * stays in its own slot, and one is lost only where every slot is taken and the
 * player picks which to drop.
 */
export interface RunSummary {
  readonly held: number;
  readonly gods: number;
  readonly goals: number;
}

/**
 * What one slot is. `open` is the run in progress and `saved` is a run in a
 * slot nobody is in; a run holding nothing is `empty`, which is what keeps an
 * abandoned start out of the four a player has to choose between.
 */
export type SlotState = "empty" | "open" | "saved" | "unreadable";

export interface SlotView {
  readonly slot: SaveSlot;
  readonly state: SlotState;
  /** The three counts, where the slot holds a run to count. */
  readonly summary: RunSummary | null;
}

export interface SaveScreenProps {
  /** All three, in slot order, whatever they hold. */
  readonly slots: readonly SlotView[];
  /** Continues the open run, or looks at a saved one. */
  readonly onOpen: (slot: SaveSlot) => void;
  /** Starts a fresh run in a slot, replacing whatever that slot held. */
  readonly onStart: (slot: SaveSlot) => void;
  /** Back out of the game entirely, which is what the games' own arrow does. */
  readonly onLeave: () => void;
  /**
   * Whether this game's stored runs could not be read at all.
   *
   * The slots draw empty either way, and left to speak for themselves they tell
   * the player they have no saved runs — which is a different thing from the
   * store never having opened, and the one case where it is wrong.
   */
  readonly unsaved?: boolean;
}

export function SaveScreen({ slots, onOpen, onStart, onLeave, unsaved = false }: SaveScreenProps) {
  const game = useGame();
  const { ref, onKeyDown } = useDialog(onLeave);
  const titleId = useId();
  /**
   * Whether the screen is asking which run to replace, which it only does when
   * every slot is taken. Two deliberate presses rather than a confirmation
   * nobody reads: the player arms it, and then names the run they are dropping.
   */
  const [replacing, setReplacing] = useState(false);

  const free = slots.find((slot) => slot.state === "empty") ?? null;
  const asking = replacing && free === null;

  /* No click-away, unlike the two dialogs that share this shade: leaving here
     goes back to the front page rather than dismissing something, and a stray
     click should not take a player out of the game they just opened. */
  return (
    <div className="sheet-scrim" onKeyDown={onKeyDown}>
      <div
        className="saves"
        data-game={game}
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <h2 className="saves__title" id={titleId}>
          {asking ? "Choose a run to replace" : "Choose a save slot to begin"}
        </h2>

        {unsaved ? (
          <p className="saves__unsaved">
            Saved runs can&rsquo;t be read here, and a run started now won&rsquo;t be kept.
          </p>
        ) : null}

        {/* The game's own slot frame, on the list rather than on each slot: one
            declaration inherits to all three, and a slot that is only ever
            drawn beside its siblings never differs from them. Absent art sets
            nothing and the plain border stays. */}
        {/* Four tracks and always four: the row no longer changes shape with
            what is stored, so nothing a player is reaching for can move. */}
        <ul
          className="saves__slots"
          style={
            {
              ...chromeStyle(game, "saveslot"),
              "--saveslots": String(slots.length + 1),
            } as CSSProperties
          }
        >
          {/* Fixed order, whatever is present: a slot that moves depending on
              what is stored is a slot a player has to read before pressing. */}
          <li className="saves__slot">
            <button
              type="button"
              className="saves__take"
              onClick={() => {
                if (free !== null) onStart(free.slot);
                else setReplacing(!replacing);
              }}
            >
              {/* Empty, and it holds the line the numbered slots put their
                  number on — without it this label sits a line above theirs.
                  Hidden from a reader, who is not missing anything. */}
              <span className="saves__ordinal" aria-hidden="true" />
              {/* The label and nothing else, the user's call: which slot it
                  takes is not a choice, and a full screen says what it is
                  asking by changing state rather than by warning first. */}
              <span className="saves__what">{asking ? "Never mind" : "Start a new run"}</span>
            </button>
          </li>

          {slots.map((slot) => (
            <Slot
              key={slot.slot}
              view={slot}
              asking={asking}
              onPress={() => {
                if (asking) {
                  setReplacing(false);
                  onStart(slot.slot);
                  return;
                }
                onOpen(slot.slot);
              }}
            />
          ))}
        </ul>

        <button type="button" className="saves__back" onClick={onLeave}>
          Return to Home
        </button>
      </div>
    </div>
  );
}

function Slot({
  view,
  asking,
  onPress,
}: {
  readonly view: SlotView;
  readonly asking: boolean;
  readonly onPress: () => void;
}) {
  const { slot, state, summary } = view;
  // An empty slot is not a control: the row above allocates, so pressing here
  // would be a second way to do one thing. Never reached while asking, which
  // only happens where there is no empty slot left.
  if (state === "empty") {
    return (
      <li className="saves__slot" data-empty="true">
        <span className="saves__ordinal">Slot {slot}</span>
        <span className="saves__empty">( Empty Save Slot )</span>
      </li>
    );
  }

  /* A damaged save is not a control either, for the plainer reason that there
     is nothing behind it to open. It keeps its slot and says what it is, and
     the only thing that can be done with it — replacing it — is the asking
     below, which is where every other slot is replaced too. */
  if (state === "unreadable" && !asking) {
    return (
      <li className="saves__slot" data-filed="true" data-damaged="true">
        <span className="saves__ordinal">Slot {slot}</span>
        <span className="saves__what">Damaged save</span>
        <p className="saves__note">
          This build could not read it. Starting a run here replaces it.
        </p>
      </li>
    );
  }

  return (
    <li
      className="saves__slot"
      data-filled={state === "open" ? "true" : undefined}
      data-filed={state === "saved" || state === "unreadable" ? "true" : undefined}
    >
      <button type="button" className="saves__take" onClick={onPress}>
        <span className="saves__ordinal">Slot {slot}</span>
        <span className="saves__what">{label(state, asking)}</span>
        {/* A damaged save is the one filled slot with no counts to draw, so it
            says what it is instead — including that it can be reclaimed. */}
        {state === "unreadable" ? (
          <p className="saves__note">
            This build could not read it. Starting a run here replaces it.
          </p>
        ) : null}
        {summary === null ? null : (
          <dl className="saves__stats">
            <Stat label="Boons" value={summary.held} />
            <Stat label="Gods met" value={summary.gods} />
            <Stat label="Goals" value={summary.goals} />
          </dl>
        )}
      </button>
    </li>
  );
}

function label(state: SlotState, asking: boolean): string {
  if (asking) return "Replace this run";
  if (state === "open") return "Continue run";
  if (state === "unreadable") return "Damaged save";
  return "Saved run";
}

/** One line of a filled slot, the way both games lay their own out. */
function Stat({ label, value }: { readonly label: string; readonly value: number }) {
  return (
    <div className="saves__stat">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
