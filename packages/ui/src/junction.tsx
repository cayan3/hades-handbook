import type { Status } from "@repo/core";

/**
 * The small node standing for an "any of these" branch point, rendering the same
 * three-way answer the engine gives for the group.
 *
 * A node rather than a line style on purpose: whether a requirement is a choice
 * or a list is structure, and structure drawn as texture is what made an earlier
 * version of this design unreadable. Line style here means one thing only —
 * whether a path is contributing — so the branch point has to be visible.
 *
 * Three states, not five. A junction can't be held, so there is no Obtained, and
 * the started-or-not question splitting Pending from Locked is about a boon's
 * progress rather than a group's.
 */
export interface JunctionProps {
  /** The engine's answer for the group. */
  readonly status: Status["kind"];
  /** How many branches the group asks for. */
  readonly min: number;
  /** How many it offers. */
  readonly of: number;
}

/**
 * Not focusable, and labelled instead. Everything a junction stands for is
 * reachable through the nodes it joins and written out in the detail surface, so
 * a tab stop here is a control with nothing for a keyboard to do. Still
 * announced: "any one of five" is a fact about the requirement, not decoration.
 */
export function Junction({ status, min, of }: JunctionProps) {
  return (
    <svg
      className="junction"
      data-status={status}
      viewBox="0 0 16 16"
      role="img"
      aria-label={`Any ${min} of ${of} — ${junctionState(status)}`}
    >
      {/* Drawn rather than clipped out of a box: a clip path takes the outline
          away with the corners, which is what the first version of this did. */}
      <polygon points="8,0.9 15.1,8 8,15.1 0.9,8" />
    </svg>
  );
}

function junctionState(status: Status["kind"]): string {
  switch (status) {
    case "satisfied":
      return "met";
    case "pending":
      return "not yet met";
    case "unsatisfiable":
      return "can't happen this run";
  }
}
