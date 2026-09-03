import { useState } from "react";

/**
 * The Run Overview as a PNG, and the surface that hands one over.
 *
 * The whole view is drawn rather than the part of it on screen: the overview
 * scrolls inside itself and a full run is twenty-odd boons across half a dozen
 * groups, so a viewport capture would be an arbitrary slice of a build.
 *
 * Everything the picture needs is fetched and embedded before it is drawn,
 * because an SVG rendered as an image may not make a request of its own. That
 * is also what keeps the canvas clean enough to read back.
 */

/** A subtree the picture leaves out. Controls carry it; content does not. */
export const OMIT = "data-picture";

/**
 * Room under the last line, and it earns its place rather than tidying: the
 * height is measured in the page and the picture is laid out a second time
 * inside the SVG, so any drift between the two eats this and not the footer.
 */
export const SLACK = 24;

/**
 * Twice the CSS pixel, under a ceiling because a bitmap is what actually
 * fails: iOS allocates far less canvas than a desktop and a long run is a tall
 * image, so the scale gives way before the picture does.
 */
const SCALE = 2;
const MAX_PIXELS = 16e6;

const XHTML = "http://www.w3.org/1999/xhtml";

/** Same-origin absolute paths, which are the only ones this ever embeds. */
const CSS_URL = /url\(\s*["']?(\/[^"')]+)["']?\s*\)/g;

export interface RunPicture {
  /**
   * A `data:` URL, and not for convenience: the policy's `img-src` allows
   * `data:` and refuses `blob:`, so an object URL here draws nothing at all.
   */
  readonly png: string;
  /** The same bytes as a file, which is what a share sheet takes. */
  readonly file: File;
  readonly width: number;
  readonly height: number;
  /** Icons the fetch could not reach. Each is a hole in the picture. */
  readonly missing: number;
}

/**
 * The view as the picture draws it: everything marked omitted taken out, and
 * the view's own clipping undone.
 *
 * The clipping matters more than it looks. `max-height` is in `vh`, and inside
 * the picture a viewport height is the picture's own — so left alone the view
 * would crop itself to nine tenths of itself and take the footer with it.
 */
export function pictureClone(view: HTMLElement): HTMLElement {
  const clone = view.cloneNode(true) as HTMLElement;
  for (const omitted of clone.querySelectorAll(`[${OMIT}]`)) omitted.remove();
  clone.style.maxHeight = "none";
  clone.style.overflow = "visible";
  // A shadow with nothing behind it reads as dirt along the edge of a picture.
  clone.style.boxShadow = "none";
  return clone;
}

/**
 * Every rule in the document, which is how the picture is styled by the same
 * stylesheet the view is. A sheet from outside the app throws on being read and
 * is skipped rather than failing the export.
 */
export function pictureStyles(sheets: StyleSheetList): string {
  const rules: string[] = [];
  for (const sheet of sheets) {
    let list: CSSRuleList;
    try {
      list = sheet.cssRules;
    } catch {
      continue;
    }
    for (const rule of list) rules.push(rule.cssText);
  }
  return rules.join("\n");
}

/**
 * What has to be embedded: the art each tile draws and the faces the stylesheet
 * names. Both are same-origin files the picture cannot fetch for itself.
 */
export function sourceUrls(css: string, clone: HTMLElement): string[] {
  const urls = new Set<string>();
  for (const image of clone.querySelectorAll("img")) {
    const src = image.getAttribute("src");
    if (src !== null && src.startsWith("/")) urls.add(src);
  }
  for (const [, url] of css.matchAll(CSS_URL)) urls.add(url!);
  return [...urls];
}

/**
 * Swaps each icon for its bytes and counts the ones that did not arrive. A tile
 * whose art is missing loses the image rather than showing a broken one, and
 * the count is reported so the player is told rather than handed a hole.
 */
export function paintImages(clone: HTMLElement, assets: ReadonlyMap<string, string>): number {
  let missing = 0;
  for (const image of clone.querySelectorAll("img")) {
    const src = image.getAttribute("src");
    const data = src === null ? undefined : assets.get(src);
    if (data === undefined) {
      missing++;
      image.removeAttribute("src");
    } else {
      image.setAttribute("src", data);
    }
  }
  return missing;
}

/** A face that did not arrive keeps its path and falls back to the stack. */
export function paintStyles(css: string, assets: ReadonlyMap<string, string>): string {
  return css.replace(CSS_URL, (whole, url: string) => {
    const data = assets.get(url);
    return data === undefined ? whole : `url("${data}")`;
  });
}

/**
 * The picture as one SVG string.
 *
 * The stylesheet is a child of the root rather than of the page, in a CDATA
 * section: this is an XML document, and CSS put through a serializer comes back
 * with its combinators escaped.
 */
export function pictureSvg(page: string, css: string, width: number, height: number): string {
  // The one string that would end the section early. Loud, because a picture
  // that silently lost its styling still looks like a picture.
  if (css.includes("]]>")) throw new Error("a style rule would close the picture's CDATA");

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
    `viewBox="0 0 ${width} ${height}">` +
    `<style><![CDATA[${css}]]></style>` +
    `<foreignObject x="0" y="0" width="100%" height="100%">${page}</foreignObject>` +
    `</svg>`
  );
}

/**
 * The page the view is drawn on. `body`'s own rules cannot reach inside a
 * picture — there is no body in it — so the three it carries are written here,
 * reading the same tokens `:root` hands down.
 */
export function pictureFrame(clone: HTMLElement, width: number): HTMLElement {
  const page = document.createElementNS(XHTML, "div") as HTMLElement;
  page.style.cssText =
    `width:${width}px;padding-bottom:${SLACK}px;` +
    `background:var(--ground,#12100f);color:var(--ink,#f2ece4);` +
    `font-family:var(--face-body,system-ui,sans-serif)`;
  page.appendChild(clone);
  return page;
}

/**
 * The drawn height plus the slack. Measured off the mounted clone, which is the
 * only thing that knows: the view is a scroll box, so its own box height is the
 * window's and not the run's.
 */
export function pictureHeight(clone: HTMLElement): number {
  return Math.ceil(clone.getBoundingClientRect().height) + SLACK;
}

/** Shrinks rather than refuses, a smaller picture being better than none. */
export function pictureScale(width: number, height: number): number {
  return Math.min(SCALE, Math.sqrt(MAX_PIXELS / (width * height)));
}

/**
 * Where the clone is measured: off-screen, and **inert**, not merely hidden.
 *
 * `aria-hidden` does not take anything out of the tab order, and the clone is a
 * second copy of every tile the view draws — so without this a keyboard lands
 * in a copy of the run that is about to be deleted.
 */
export function pictureStage(page: HTMLElement, width: number): HTMLElement {
  const stage = document.createElement("div");
  stage.setAttribute("aria-hidden", "true");
  stage.inert = true;
  stage.style.cssText = `position:absolute;left:-10000px;top:0;width:${width}px`;
  stage.appendChild(page);
  return stage;
}

/**
 * Draws the view and hands back the picture.
 *
 * The clone is mounted off-screen to be measured, and that is the only way to
 * get a height: the view is a scroll box and the omitted controls have to be
 * gone before anything is counted.
 */
export async function takePicture(view: HTMLElement): Promise<RunPicture> {
  const width = Math.round(view.getBoundingClientRect().width);
  const clone = pictureClone(view);
  const page = pictureFrame(clone, width);

  const stage = pictureStage(page, width);
  document.body.appendChild(stage);

  try {
    const styles = pictureStyles(document.styleSheets);
    const assets = await fetchAssets(sourceUrls(styles, clone));
    const missing = paintImages(clone, assets);
    // Measured after the swap: a data URI is the same drawing at the same size,
    // but measuring first would read a layout the picture does not have.
    const height = pictureHeight(clone);
    const svg = pictureSvg(
      new XMLSerializer().serializeToString(page),
      paintStyles(styles, assets),
      width,
      height,
    );
    const { png, file } = await rasterise(svg, width, height);
    return { png, file, width, height, missing };
  } finally {
    stage.remove();
  }
}

async function rasterise(
  svg: string,
  width: number,
  height: number,
): Promise<{ png: string; file: File }> {
  const scale = pictureScale(width, height);
  const image = new Image();
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await image.decode();

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const context = canvas.getContext("2d");
  if (context === null) throw new Error("no canvas to draw the picture on");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (blob === null) throw new Error("the picture would not encode");
  return {
    png: await asDataUrl(blob),
    file: new File([blob], PICTURE_FILE, { type: "image/png" }),
  };
}

/** Named for what it is rather than for the product, which is one constant. */
const PICTURE_FILE = "run-overview.png";

async function fetchAssets(urls: readonly string[]): Promise<Map<string, string>> {
  const assets = new Map<string, string>();
  await Promise.all(
    urls.map(async (url) => {
      try {
        const response = await fetch(url);
        if (response.ok) assets.set(url, await asDataUrl(await response.blob()));
      } catch {
        // Left out of the map, which is how the caller counts it as missing.
      }
    }),
  );
  return assets;
}

function asDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("could not read a picture asset"));
    reader.readAsDataURL(blob);
  });
}

/**
 * The picture, shown in the view it was taken of.
 *
 * The image is the handover and the controls beside it are shortcuts: a picture
 * on a page is long-pressed on a phone and right-clicked on a desktop, and
 * neither gesture can be refused by a policy or missing from a platform.
 */
export interface PicturePanelProps {
  readonly picture: RunPicture;
  /** Back to the run, which is what the corner control turns into. */
  readonly onBack: () => void;
}

export function PicturePanel({ picture, onBack }: PicturePanelProps) {
  /**
   * Asked once rather than per render, and it is a capability rather than a
   * guess about the device: a platform with a share sheet is where a picture
   * reaches somebody else, and a save is what everywhere else has.
   */
  const [shareable] = useState(() => canShare(picture.file));

  return (
    <>
      <img
        className="picture__image"
        src={picture.png}
        width={picture.width}
        height={picture.height}
        alt="This run's overview, drawn as one picture."
      />

      {picture.missing === 0 ? null : (
        <p className="picture__missing">
          {picture.missing === 1
            ? "One icon could not be drawn into the picture."
            : `${picture.missing} icons could not be drawn into the picture.`}
        </p>
      )}

      <p className="picture__hint">
        Press and hold the picture, or right-click it, to save it anywhere else.
      </p>

      <div className="overview__actions">
        {shareable ? (
          <button
            type="button"
            className="overview__close"
            onClick={() => {
              // A cancelled share is a player changing their mind, and the save
              // beside it is still there either way.
              void navigator.share({ files: [picture.file] }).catch(() => {});
            }}
          >
            Share this picture
          </button>
        ) : null}
        <a className="overview__slots picture__save" href={picture.png} download={PICTURE_FILE}>
          Save this picture
        </a>
        <button type="button" className="overview__slots" onClick={onBack}>
          Back to the run
        </button>
      </div>
    </>
  );
}

function canShare(file: File): boolean {
  return typeof navigator.canShare === "function" && navigator.canShare({ files: [file] });
}

/**
 * The corner control, which is where this goes rather than in the action row:
 * that row is three decided controls and already the widest thing on the view.
 */
export function PictureGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="8.5" cy="10" r="1.5" />
      <path d="M4 17l5-5 4 4 3-2.5 4 3.5" />
    </svg>
  );
}
