import type { GameKey } from "@repo/catalog";
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
const GameContext = createContext<GameKey>("hades2");

/**
 * Context rather than a prop threaded through every node: which ladder is in
 * force is a property of the page, and two nodes on different ladders is not a
 * state anything should be able to produce.
 */
export function NodePresentation({
  ladder,
  game,
  children,
}: {
  readonly ladder: Ladder;
  readonly game: GameKey;
  readonly children: ReactNode;
}) {
  return (
    <LadderContext.Provider value={ladder}>
      <GameContext.Provider value={game}>{children}</GameContext.Provider>
    </LadderContext.Provider>
  );
}

export function useLadder(): Ladder {
  return useContext(LadderContext);
}

/**
 * The game is here because a node's silhouette follows the art, and the art is
 * shaped differently in the two games. It rides alongside the ladder for the
 * same reason that does: it is a fact about the page, not about a boon.
 */
export function useGame(): GameKey {
  return useContext(GameContext);
}
