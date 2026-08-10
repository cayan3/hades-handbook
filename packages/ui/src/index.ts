/**
 * Shared components.
 *
 * All boon & god art goes through the icon resolver and all description text
 * through the text resolver, so either set can easily be swapped or withdrawn
 * in one place. A component receives what a resolver returned; it never builds
 * a path or reads a description off a record itself.
 *
 * Nothing here is ever rendered as markup. The two things this product puts on
 * screen that it did not write — extracted game text, and the player's own
 * notes — are both handed to the framework as text, which escapes them. The
 * framework's opt-out of that escaping (`dangerouslySetInnerHTML`) is not used
 * anywhere in this package and reaching for it is a mistake to report rather
 * than to make.
 *
 * The one component here is throwaway scaffolding for the real library; see
 * its own comment.
 */

export { BoonDiamond } from "./boon-diamond.js";
export type { BoonDiamondProps } from "./boon-diamond.js";
