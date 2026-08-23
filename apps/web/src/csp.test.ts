import { describe, expect, it } from "vitest";

import { FRAMING, POLICY, documentAtRoot, headersFile } from "../vite.config";

/**
 * The header file carries the one directive a meta policy cannot, and a
 * malformed one fails the way that is hardest to notice: the host reads what it
 * can parse, serves the rest without comment, and nothing on the page says a
 * directive went missing.
 */
describe("the response-header file", () => {
  const file = headersFile();

  it("carries the directive a meta policy cannot", () => {
    expect(file).toContain(`Content-Security-Policy: ${FRAMING}`);
  });

  /**
   * Chrome logs a warning for every visitor when a tag carries a directive a
   * tag cannot enforce, so once the header carries it for real the inert copy
   * buys noise and nothing else. Held apart in both directions: the tag must
   * not have it, the header must.
   */
  it("keeps the framing directive out of the page's own policy", () => {
    expect(POLICY).not.toContain("frame-ancestors");
    expect(file).toContain(FRAMING);
  });

  /**
   * A worker runs under the policy of the response that delivered it, and this
   * file matches every path. The page's policy refuses every request, and
   * precaching is all fetch — so a blanket rule carrying it is an install that
   * fetches nothing and a registration that never appears. Measured on the
   * deployed origin: the host combines matching rules rather than letting a
   * specific one win, so a second rule for the worker cannot take it back.
   */
  it("carries nothing that governs what the worker may fetch", () => {
    expect(file).not.toContain("connect-src");
    expect(file).not.toContain("default-src");
    expect(file).not.toContain("script-src");
  });

  it("indents every header under an unindented path glob", () => {
    const lines = file.split("\n").filter((line) => line !== "");
    expect(lines[0]).toBe("/*");
    for (const header of lines.slice(1)) {
      expect(header.startsWith("  ")).toBe(true);
      expect(header.trim()).toMatch(/^[A-Za-z-]+: \S/);
    }
  });

  /**
   * The browser fetches the manifest's icons to decide whether the site is
   * installable, and does it as a raw resource rather than an image — so
   * `connect-src` governs them and `img-src` never sees them. Under 'none' both
   * were refused on the deployed site. Off-origin stays refused, which is the
   * half a local-first product actually promises.
   */
  it("lets the platform fetch same-origin, and nothing further", () => {
    expect(POLICY).toContain("connect-src 'self'");
    expect(POLICY).not.toContain("connect-src 'none'");
    expect(POLICY).not.toMatch(/connect-src [^;]*https?:/);
  });

  it("ends with a newline, so a host that appends a rule does not join it", () => {
    expect(file.endsWith("\n")).toBe(true);
  });
});

/**
 * The host serves the app at `/` and 308s `/index.html` to it — measured on the
 * origin, where it was the one precache URL of fifty-nine not answering 200. A
 * precache is all-or-nothing, so that entry takes the whole install with it.
 */
describe("the document's precache entry", () => {
  it("is the path the host actually serves", () => {
    const entries = [{ url: "index.html", revision: "abc" }, { url: "assets/app.js", revision: null }];
    expect(documentAtRoot(entries)).toEqual([
      { url: "/", revision: "abc" },
      { url: "assets/app.js", revision: null },
    ]);
  });

  it("leaves every other entry alone, including one that merely contains the name", () => {
    const entries = [{ url: "docs/index.html.bak", revision: "x" }, { url: "art/a.webp", revision: "y" }];
    expect(documentAtRoot(entries)).toEqual(entries);
  });
});
