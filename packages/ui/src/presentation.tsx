import { createContext, type ReactNode, useContext } from "react";

/**
 * Which of the two ladders the nodes below are drawn on.
 *
 * `real-art` is the design: state rides on the frame and on what is done to the
 * artwork, since official icons are detailed and already coloured and a fill
 * over one would bury it. `fallback` is the same five steps with no artwork at
 * all, carried by fill and frame, with god colour back on the node.
 *
 * One component and one stylesheet with both ladders in it, never two
 * components — the second would be the one nobody looked at until the day it
 * was the only one.
 */
export type Ladder = "real-art" | "fallback";

const LadderContext = createContext<Ladder>("real-art");

/**
 * Context rather than a prop threaded through every node: which ladder is in
 * force is a property of the page, and two nodes on different ladders is not a
 * state anything should be able to produce.
 */
export function NodePresentation({
  ladder,
  children,
}: {
  readonly ladder: Ladder;
  readonly children: ReactNode;
}) {
  return <LadderContext.Provider value={ladder}>{children}</LadderContext.Provider>;
}

export function useLadder(): Ladder {
  return useContext(LadderContext);
}
