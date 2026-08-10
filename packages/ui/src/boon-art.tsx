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
const ART_FORMAT = "png";

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
