/**
 * Shared components, in two halves.
 *
 * The larger half is text — what a node is called, what state it is in, why it
 * cannot be had, what it is still waiting for — as plain functions over the
 * engine's answers, testable without a document near them. The smaller half
 * draws that text as diamonds. The accessible path promises that anything the
 * drawing says the text says too, and building the text first is what makes that
 * cheap to keep rather than something to retrofit.
 *
 * Art goes through the icon resolver, names and description text through theirs,
 * so any of them can be swapped or withdrawn in one place. A component renders
 * what a resolver returned and never builds a path or reads a record itself.
 *
 * Nothing here is rendered as markup. The two things this product shows that it
 * did not write — extracted game text and the player's own notes — are handed to
 * the framework as text, which escapes them; the opt-out is not used anywhere in
 * this package and reaching for it is a mistake to report rather than make.
 *
 * Nothing here reads run state either. Every component takes derived values, so
 * this package opens no store, subscribes to nothing and has no clock.
 *
 * The stylesheet is a separate export (`@repo/ui/nodes.css`) the app includes,
 * rather than something a component imports, so nothing here needs a bundler.
 */

export { BoonNode } from "./boon-node.js";
export type { BoonNodeProps } from "./boon-node.js";
export { BoonArt, artUrl } from "./boon-art.js";
export type { BoonArtProps } from "./boon-art.js";
export { Junction } from "./junction.js";
export type { JunctionProps } from "./junction.js";
export { TierBands } from "./tier-bands.js";
export type { TierBandsProps } from "./tier-bands.js";
export { ActionSheet } from "./action-sheet.js";
export type { ActionSheetProps } from "./action-sheet.js";
export { NodePresentation, useLadder } from "./presentation.js";
export type { Ladder } from "./presentation.js";
export { MarkerGlyph, DormantGlyph } from "./glyphs.js";

export { createNodeSource, deriveNodeView, deriveNodeDetail } from "./node-view.js";
export type { NodeDetail, NodeSource, NodeView } from "./node-view.js";
export { createNodeCache } from "./node-cache.js";
export type { NodeCache } from "./node-cache.js";

export { catalogNaming } from "./naming.js";
export type { Naming } from "./naming.js";
export { godColour, colouredGods } from "./god-palette.js";
export {
  POOL_FULL_BODY,
  POOL_FULL_COPY,
  POOL_FULL_LEAD,
  accessibleName,
  activationLines,
  impossibleNotice,
  neededLines,
  reasonSentence,
  stateSentence,
} from "./describe.js";
export type { ImpossibleNotice } from "./describe.js";
