import { describe, expect, it } from "vitest";

import { POLICY, headersFile } from "../vite.config";

/**
 * The header file is the only place `frame-ancestors` is enforceable, and a
 * malformed one fails the way that is hardest to notice: the host reads what it
 * can parse, serves the rest without comment, and nothing on the page says a
 * directive went missing.
 */
describe("the response-header file", () => {
  const file = headersFile(POLICY);

  it("carries the same policy the page's meta tag carries", () => {
    expect(file).toContain(`  Content-Security-Policy: ${POLICY}`);
  });

  it("carries the directive a meta policy cannot", () => {
    expect(file).toContain("frame-ancestors 'none'");
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
