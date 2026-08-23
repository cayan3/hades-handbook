import { describe, expect, it } from "vitest";

import { POLICY, headersFile } from "../vite.config";

/**
 * The header file carries the one directive a meta policy cannot, and a
 * malformed one fails the way that is hardest to notice: the host reads what it
 * can parse, serves the rest without comment, and nothing on the page says a
 * directive went missing.
 */
describe("the response-header file", () => {
  const file = headersFile(POLICY);

  it("carries the directive a meta policy cannot", () => {
    expect(file).toContain("Content-Security-Policy: frame-ancestors 'none'");
  });

  it("takes that directive from the page's own policy", () => {
    expect(() => headersFile("default-src 'none'; script-src 'self'")).toThrow(
      /frame-ancestors/,
    );
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

  it("ends with a newline, so a host that appends a rule does not join it", () => {
    expect(file.endsWith("\n")).toBe(true);
  });
});
