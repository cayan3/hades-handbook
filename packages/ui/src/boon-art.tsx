import {
  type ChromePart,
  type GameKey,
  chromeFor,
  elementIconFor,
  godIconFor,
  markerIconFor,
  slotIconFor,
} from "@repo/catalog";
import type { Element, GodId, SlotId } from "@repo/core";
import { useEffect, useState } from "react";

/**
 * Where an art key becomes something a browser can fetch. The resolver returns a
 * set-relative key (`official/Zeus_Attack`) and owns which set is in force; this
 * owns where that set is served from and in what format, so swapping the set
 * stays a one-line edit there and no component builds a path.
 *
 * Composition is here rather than in the resolver because the resolver is
 * synchronous and cannot know whether a file loads. Per-file recovery has to
 * happen where the error event arrives, which is a component — and having decided
 * a component owns the failure, it may as well own the URL.
 */
const ART_BASE = "/art";
// WebP at quality 90: a third the size of PNG with nothing visible lost, which
// puts the whole set under 3 MB. Anything that can install a PWA decodes it.
const ART_FORMAT = "webp";

export function artUrl(iconKey: string): string {
  return `${ART_BASE}/${iconKey}.${ART_FORMAT}`;
}

/**
 * A different failure from a missing record. A record with no icon resolves to a
 * missing-art key before any of this; this is a key naming a file that isn't
 * there or won't decode, which nothing detects until a browser has tried. Both
 * land on the same image, because to a player they are the same thing.
 */
const MISSING_ART = artUrl("official/_missing");

export interface BoonArtProps {
  /** What the resolver returned. Never a path built by a caller. */
  readonly iconKey: string;
}

/**
 * Empty alternative text on purpose: the name is on the node and in its
 * accessible name already, so the image is decoration over a control that
 * has said what it is.
 */
export function BoonArt({ iconKey }: BoonArtProps) {
  const url = artUrl(iconKey);
  const [src, setSrc] = useState(url);

  // A node gets reused for a different boon as a list re-renders, and the
  // previous fallback would otherwise stay stuck on it.
  useEffect(() => setSrc(url), [url]);

  return (
    <img
      className="node__art"
      src={src}
      alt=""
      draggable={false}
      onError={() => setSrc(MISSING_ART)}
    />
  );
}

export interface ElementArtProps {
  readonly game: GameKey;
  readonly element: Element;
  /**
   * Where it is drawn. The default is the node's corner, which is positioned
   * absolutely — a caller putting one in a row has to say so, or it is taken out
   * of that row's flow.
   */
  readonly className?: string;
}

/**
 * A god's own symbol. Decorative like the others: whatever draws one carries the
 * god's name in text, which it has to — Hades reaches a tab in both games and
 * has no symbol in either set.
 */
export function GodArt({
  game,
  god,
  className = "god-art",
}: {
  readonly game: GameKey;
  readonly god: GodId;
  readonly className?: string;
}) {
  const url = artUrl(godIconFor(game, god));
  const [src, setSrc] = useState(url);

  useEffect(() => setSrc(url), [url]);

  return (
    <img
      className={className}
      src={src}
      alt=""
      draggable={false}
      onError={() => setSrc(MISSING_ART)}
    />
  );
}

/**
 * The glyph the game draws in a slot nobody has filled. Nothing where the game
 * draws nothing, which is the Hades II Hex: unlike everything else here it does
 * not fall back to the placeholder, a broken-file mark saying the opposite of
 * "still open". Decorative — the caller names the position in text.
 */
export function SlotArt({
  game,
  slot,
  className = "loadout__slotart",
}: {
  readonly game: GameKey;
  readonly slot: SlotId;
  readonly className?: string;
}) {
  const key = slotIconFor(game, slot);
  const url = key === null ? null : artUrl(key);
  const [src, setSrc] = useState(url);

  useEffect(() => setSrc(url), [url]);

  if (src === null) return null;
  return (
    <img
      className={className}
      src={src}
      alt=""
      draggable={false}
      onError={() => setSrc(null)}
    />
  );
}

/**
 * The Forget-Me-Not marker as the game draws it, or nothing where the resolver
 * has no file — the caller draws its own glyph then.
 *
 * **Nothing rather than the placeholder**, which is the rule the panel chrome
 * and the empty slots already follow: a broken-file mark in the corner of a card
 * says the opposite of what a pin means, and the drawn glyph it falls back to is
 * a complete answer rather than a hole. Decorative either way — whatever draws
 * one says in words whether the goal is finished.
 */
export function MarkerArt({
  game,
  className = "node__marker",
}: {
  readonly game: GameKey;
  readonly className?: string;
}) {
  const key = markerIconFor(game);
  const url = key === null ? null : artUrl(key);
  const [src, setSrc] = useState(url);

  useEffect(() => setSrc(url), [url]);

  if (src === null) return null;
  return (
    <img
      className={className}
      src={src}
      alt=""
      draggable={false}
      // Back to nothing rather than to the placeholder, so a file that fails to
      // decode lands on the drawn glyph the same way an absent one does.
      onError={() => setSrc(null)}
    />
  );
}

/**
 * The stylesheet's way in, for the one kind of art no component renders: a
 * nine-slice is a `border-image`, which only a stylesheet expresses. What
 * crosses is a custom property, as `--rarity` already does, so the resolver
 * keeps the path.
 *
 * An absent part sets nothing, so `border-image-source` computes to `none` and
 * the panel keeps its own frame — the fallback, settled here rather than by
 * watching whether a file loaded.
 */
export function chromeStyle(game: GameKey, part: ChromePart): Record<string, string> {
  const key = chromeFor(game, part);
  return key === null ? {} : { "--chrome-panel": `url("${artUrl(key)}")` };
}

/**
 * Which element a Hades II boon counts toward, in its top-left corner. Fetched
 * rather than drawn like the two glyphs beside it, because this has to say which
 * of five and they only have to say that something is true. Decorative: the
 * affinity is a sentence in the node's description too.
 */
export function ElementArt({ game, element, className = "node__element" }: ElementArtProps) {
  const url = artUrl(elementIconFor(game, element));
  const [src, setSrc] = useState(url);

  useEffect(() => setSrc(url), [url]);

  return (
    <img
      className={className}
      src={src}
      alt=""
      draggable={false}
      onError={() => setSrc(MISSING_ART)}
    />
  );
}
