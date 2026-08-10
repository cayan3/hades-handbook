import { createContext, type ReactNode, useContext } from "react";

/**
 * Which of the two ladders the nodes below are drawn on.
 *
 * `real-art` is the default and the design: state rides on the frame and on the
 * artwork's own treatment, since official icons are detailed and already coloured
 * and a fill over one would bury it. `fallback` is the same five steps with no
 * artwork, carried by fill and frame, with god colour back on the node as the
 * only identity channel left.
 *
 * One component and one stylesheet with two ladders in it, not two components.
 * The second would be the one nobody looked at until the day it was the only one.
 */
export type Ladder = "real-art" | "fallback";

const LadderContext = createContext<Ladder>("real-art");

/**
 * Context rather than a prop threaded through every node: this is a property of
 * the whole product at a moment, never of one node. A page with two nodes on
 * different ladders isn't a state anything should be able to produce.
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
