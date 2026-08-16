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
 * Nothing here reads run state either. Every component takes derived values and
 * every write is a callback the caller supplies, so this package opens no
 * store, subscribes to nothing and has no clock. It names `sync`'s types where
 * a sentence is about one — an edit to take back, an entry a load set aside —
 * which is a description of what happened, not a way to reach the source.
 *
 * The stylesheet is a separate export (`@repo/ui/nodes.css`) the app includes,
 * rather than something a component imports, so nothing here needs a bundler.
 */

export { BoonNode } from "./boon-node.js";
export type { BoonNodeProps } from "./boon-node.js";
export { BoonArt, GodArt, MarkerArt, artUrl } from "./boon-art.js";
export type { BoonArtProps } from "./boon-art.js";
export { GodPicker } from "./god-picker.js";
export type { GodPickerProps } from "./god-picker.js";
export { useHoverDisclosure } from "./hover-disclosure.js";
export type { HoverDisclosure } from "./hover-disclosure.js";
export { BoonRow } from "./boon-row.js";
export type { BoonRowProps } from "./boon-row.js";
export { Junction } from "./junction.js";
export type { JunctionProps } from "./junction.js";
export { GodPage } from "./god-page.js";
export type { GodPageProps } from "./god-page.js";
export { ActionSheet } from "./action-sheet.js";
export type { ActionSheetProps } from "./action-sheet.js";
export { BoonActionBar } from "./boon-actions.js";
export type { BoonActions } from "./boon-actions.js";
export { NoticeBar, OverrideMarker, RarityMark, UndoToast } from "./chrome.js";
export { kindWord, rarityColour, treatmentOf } from "./rarity-palette.js";
export type { RarityTreatment } from "./rarity-palette.js";
export type { NoticeBarProps, UndoToastProps } from "./chrome.js";
export { GoalCard, GoalsPanel } from "./goals.js";
export type { Goal, GoalsPanelProps } from "./goals.js";
export { Home, HomeGlyph } from "./home.js";
export type { HomeProps } from "./home.js";
export { Loadout } from "./loadout.js";
export type { LoadoutEntry, LoadoutProps } from "./loadout.js";
export { NodePresentation, useGame, useLadder } from "./presentation.js";
export type { Ladder } from "./presentation.js";
export { MarkerGlyph, DormantGlyph } from "./glyphs.js";

export { createNodeSource, deriveNodeView, deriveNodeDetail, kindOf } from "./node-view.js";
export type {
  NodeDetail,
  NodeKind,
  NodeSource,
  NodeView,
  RequirementOption,
  RequirementRow,
} from "./node-view.js";
export { createNodeCache } from "./node-cache.js";
export type { NodeCache } from "./node-cache.js";

export {
  godGraph,
  graphTraits,
  isJunctionId,
  neighbourhood,
  pageTraits,
  stepThrough,
} from "./god-graph.js";
export {
  DETAILS_KEY,
  GOAL_KEY,
  HELP_KEY,
  NEXT_GOD_KEY,
  PREVIOUS_GOD_KEY,
  SHORTCUTS,
  focusMember,
  godStep,
  isDetailsKey,
  isGoalKey,
  isHelpKey,
  isTyping,
  memberAt,
  stepFor,
  stepIndex,
} from "./keys.js";
export type { KeyEvent, Shortcut, Step } from "./keys.js";
export { bestNextPick } from "./planning.js";
export type { BestPick } from "./planning.js";
export { Shortcuts } from "./shortcuts.js";
export type { ShortcutsProps } from "./shortcuts.js";
export { useDialog } from "./dialog.js";
export type { Dialog } from "./dialog.js";
export type {
  BandKind,
  GodGraph,
  GraphBand,
  GraphEdge,
  GraphJunction,
  GraphMember,
} from "./god-graph.js";

export { catalogNaming } from "./naming.js";
export type { Naming } from "./naming.js";
export { godColour, colouredGods } from "./god-palette.js";
export {
  PINNED_SENTENCE,
  POOL_FULL_BODY,
  POOL_FULL_COPY,
  POOL_FULL_LEAD,
  accessibleName,
  activationLines,
  displacementLines,
  impossibleNotice,
  neededLines,
  reasonSentence,
  stateSentence,
} from "./describe.js";
export type { Displacement, ImpossibleNotice } from "./describe.js";
export {
  MARKING_HINT,
  OTHER_TAB_BODY,
  OTHER_TAB_TITLE,
  OVERRIDDEN_HINT,
  OVERRIDDEN_LABEL,
  PURGE_HINT,
  PURGE_LABEL,
  REMOVE_HINT,
  REMOVE_LABEL,
  STORAGE_ERROR_BODY,
  STORAGE_ERROR_TITLE,
  UNAFFILIATED,
  UNREADABLE_RUN_BODY,
  UNREADABLE_RUN_TITLE,
  editSentence,
  hasSomethingToSay,
  migrationMessage,
} from "./messages.js";
export type { MigrationMessage } from "./messages.js";
