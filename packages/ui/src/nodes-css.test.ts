import { describe, expect, it } from "vitest";
// The stylesheet as text rather than as a stylesheet. Read through the bundler
// so this file needs no filesystem, which the browser half of the workspace
// deliberately has no types for.
import CSS from "./nodes.css?raw";

/**
 * The rule the stylesheet exists to keep, checked by reading the stylesheet.
 *
 * State is structural and never hue: the moment a state step sets a colour, state
 * and god identity are sharing one channel and a colourblind reader has lost
 * both. That rule is a sentence in a design doc and a comment at the top of a
 * stylesheet, which between them have stopped nobody from adding a red border to
 * an impossible node at half past one in the morning.
 *
 * Blunt on purpose: it reads the declarations in every state-keyed rule and fails
 * on any property that paints. A false positive is a conversation; a false
 * negative is the ladder quietly becoming a colour code. It also holds the
 * no-hatching rule, which is easier — a repeating gradient over boon artwork
 * reads as texture rather than rank at the size these are drawn.
 */

/** Rules keyed on a state, which are the ladder's steps and nothing else. */
function stateRules(): ReadonlyArray<[string, string]> {
  const found: Array<[string, string]> = [];
  const pattern = /([^{}]*\[data-state=[^{}]*)\{([^}]*)\}/g;
  for (const match of CSS.matchAll(pattern)) {
    found.push([match[1]!.trim(), match[2]!]);
  }
  return found;
}

/**
 * `filter` and `box-shadow` are absent on purpose — they are what the ladder
 * rides on. A filter changes the brightness and saturation of whatever is there
 * already, and the frame takes its colour from a per-node custom property rather
 * than from a state.
 */
const PAINTS = /(^|[\s;])(color|background|background-color|border-color|fill|stroke|outline-color)\s*:/;

describe("the node stylesheet", () => {
  it("has the ladder in it at all", () => {
    // Guards the test rather than the stylesheet: a regex that matched nothing
    // would pass every assertion below and prove nothing at all.
    const rules = stateRules();
    expect(rules.length).toBeGreaterThanOrEqual(5);
    for (const state of ["Obtained", "Available", "Pending", "Locked", "Impossible"]) {
      expect(rules.some(([selector]) => selector.includes(state))).toBe(true);
    }
  });

  it("carries no state step as a colour", () => {
    for (const [selector, body] of stateRules()) {
      // The god colour is the exception that proves the rule: a node may take
      // a hue, and it takes it from which god granted the boon, never from
      // which rung of the ladder it is on.
      const paints = body
        .split("\n")
        .filter((line) => PAINTS.test(line) && !line.includes("--god"));
      expect(paints, `${selector} paints: ${paints.join(" ")}`).toEqual([]);
    }
  });

  it("hatches nothing", () => {
    expect(CSS).not.toMatch(/repeating-linear-gradient|repeating-conic-gradient/);
    // A blanket ban on `background-image` held this until the Loadout gained
    // the game's own tray, which is one. Narrowed to what it was always for:
    // every background image has to be a chrome part the resolver handed over,
    // so a gradient or a texture still fails wherever it is written.
    const images = [...CSS.matchAll(/background-image\s*:([^;]*);/g)].map((m) => m[1]!.trim());
    expect(images.filter((value) => !value.startsWith("var(--chrome-"))).toEqual([]);
  });

  /**
   * The dialog outranks the page, and an inner layer cannot reach past its own
   * component.
   *
   * Found by using it: the god page gave its bands a `z-index` so the connector
   * layer could sit behind them, and the scrim had none at all -- so the graph
   * painted over the open sheet and went on taking clicks through it. The toast
   * and the Goals panel had outranked it the same way for longer.
   *
   * Checked here rather than in a component test because it is a fact about
   * painting, and the runner does not paint.
   */
  it("puts the modal above everything and keeps inner layers inside", () => {
    const layers = [...CSS.matchAll(/([^{}]*)\{([^}]*z-index:\s*(\d+)[^}]*)\}/g)].map((m) => ({
      selector: m[1]!.trim(),
      order: Number(m[3]),
    }));
    const scrim = layers.find((layer) => layer.selector.includes(".sheet-scrim"));
    expect(scrim).toBeDefined();
    for (const layer of layers) {
      if (layer.selector.includes(".sheet-scrim")) continue;
      expect(layer.order, `${layer.selector} is not below the scrim`).toBeLessThan(scrim!.order);
    }

    // Every rule that orders something against a sibling has to sit in a
    // stacking context of its own, or the number leaks to the whole document.
    for (const owner of [".godpage", ".loadout__tile"]) {
      const rule = CSS.match(new RegExp(`\\${owner}\\s*\\{([^}]*)\\}`));
      expect(rule?.[1], `${owner} does not isolate`).toMatch(/isolation:\s*isolate/);
    }
  });

  /**
   * The rarity treatment follows the icon's shape, and the two games draw
   * different icons.
   *
   * Hades I's diamond takes a wedge along its upper-right edge, which is a
   * shape behind the tile shifted up and to the right. Applied unchanged to
   * Hades II's rounded square that same shift draws a coloured corner peeking
   * out from behind the icon — not a rarity anybody reads, and not what the
   * game draws. So Hades II undoes the shift and gets an even ring.
   *
   * Read out of the stylesheet because it is a fact about painting, and because
   * the rule that would break it is one line in the base that forgets there are
   * two silhouettes now.
   */
  it("rings a Hades II tile and wedges a Hades I one", () => {
    // A selector is full of characters a regex reads as its own, so it is
    // escaped whole rather than by hand — the version that escaped only the
    // leading dot matched nothing and passed by finding nothing to check.
    const rule = (selector: string) => {
      const literal = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return CSS.match(new RegExp(`${literal}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
    };

    const base = rule(".loadout__tile[data-treatment]::before");
    expect(base).toMatch(/transform:\s*translate\(/);

    const hades2 = rule('.loadout__tile[data-game="hades2"][data-treatment]::before');
    expect(hades2, "Hades II does not undo the wedge's offset").toMatch(/transform:\s*none/);
    // Concentric with the icon inside it, or the ring pinches at every corner:
    // the outer box is the larger of the two and wants the larger radius.
    expect(hades2).toMatch(/border-radius:\s*calc\(var\(--node-radius\)/);
  });

  /**
   * A Hades II node is smaller because a rounded square shows 87.9% of its box
   * where a diamond shows 49.7% — 1.77x the ink, measured over the 241 and 166
   * shipped icons. Scoped to the god page, since an unscoped rule would resize
   * the Loadout too. The Loadout then declares its own size twice: on the tile,
   * which the ring's radius comes off, and on the node inside it, a property set
   * on `.node` beating one inherited from the tile.
   */
  it("sizes a Hades II node down, and only where the report was", () => {
    const sizers = [...CSS.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^}]*)\}/g)]
      .filter(([, , body]) => /--node-size\s*:/.test(body!))
      .map(([, selector]) => selector!.trim().replace(/\s+/g, " "));
    expect(sizers).toEqual([
      ".node",
      '.godpage .node[data-game="hades2"]',
      ".loadout__tile, .loadout__tile .node, .loadout__emptyslot, .loadout__card .boonrow__icon",
      '.loadout__tile[data-game="hades2"], .loadout__tile[data-game="hades2"] .node, .loadout__emptyslot[data-game="hades2"], .loadout__card .boonrow__icon[data-game="hades2"]',
    ]);
  });

  /**
   * The tile and the icon inside it have to compute their corner from the same
   * number or the ring pinches. They did not: the icon drew at 4.5rem and the
   * ring's radius came off 3.25rem, 1.04px tighter than what it rings.
   */
  it("computes the tile's ring and its icon from one size, per game", () => {
    // One declaration per game covering the tile, the node inside it and the
    // card's icon, so the three cannot drift apart the way they did. The sizes
    // are each game's God View size: a rounded square carries 1.77x the ink of
    // a diamond at the same box, which is why they differ at all.
    const rules = CSS.replace(/\/\*[\s\S]*?\*\//g, "");
    const sizeOf = (selector: string) => {
      const body = rules.match(new RegExp(`${selector}[^{]*\\{([^}]*)\\}`))?.[1] ?? "";
      return /--node-size:\s*([\d.]+rem)/.exec(body)?.[1];
    };
    expect(sizeOf("\\.loadout__tile,")).toBe("4.5rem");
    expect(sizeOf('\\.loadout__tile\\[data-game="hades2"\\],')).toBe("3.9rem");
  });

  it("scales every corner mark with the node rather than pinning it", () => {
    // Two sizes, not one: the element symbol is drawn art saying which of five
    // and reads at a junction's 1.1rem, where a pin only has to say that it is
    // there. Both are shares of the node, which is what a fixed length loses.
    const glyphs = CSS.match(/\.node__marker,\s*\.node__dormant\s*\{([^}]*)\}/);
    expect(glyphs?.[1]).toMatch(/width:\s*var\(--corner\)/);
    const element = CSS.match(/\.node__element\s*\{([^}]*)\}/);
    expect(element?.[1]).toMatch(/width:\s*var\(--element\)/);
    for (const body of [glyphs?.[1], element?.[1]]) {
      expect(body).not.toMatch(/width:\s*[\d.]+rem/);
    }
    for (const token of ["--corner", "--element"]) {
      expect(CSS).toMatch(new RegExp(`${token}:\\s*calc\\(var\\(--node-size\\)`));
    }
  });

  /**
   * The card hangs off the panel's right edge, so the panel has to be as wide
   * as the grid and not as wide as the column. Filling the column put the card
   * at 370px in both states — measured against a collapsed grid ending at
   * 113px, which left it over the god page with 258px of nothing beside it.
   * Both rules have to be in the query that takes the card out of the flow: in
   * the flow, below it, the panel is what the two of them share.
   */
  it("sizes the card's anchor to the grid, in the query that floats it", () => {
    const floated = CSS.match(/@media \(min-width: 48rem\) \{([\s\S]*?)\n\}/g)?.find((block) =>
      block.includes(".loadout__cards"),
    );
    expect(floated).toBeDefined();
    expect(floated).toMatch(/\.loadout__panel\s*\{[^}]*width:\s*fit-content/);
    expect(floated).toMatch(/\.loadout__cards\s*\{[^}]*position:\s*absolute/);
  });

  it("fills the loadout's rest down a column before starting the next", () => {
    // Across-then-down was what a wrapping row gave; a build reads as columns,
    // and the core slots beside it are one. A fixed row count does it without
    // anyone measuring a height, which is why it is a grid and not a flex wrap.
    const rest = CSS.match(/\.loadout__rest\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(rest).toMatch(/grid-auto-flow:\s*column/);
    expect(rest).toMatch(/grid-template-rows:\s*repeat\(var\(--core-rows/);
    expect(rest).not.toMatch(/flex-wrap/);
  });

  it("does not keep a tooltip up on the focus a click leaves behind", () => {
    // A pointer that taps a boon leaves the focus on it, so `:focus-within`
    // held the tip open after the pointer had gone — invisible until a tip
    // arrived that survives being clicked. `:focus-visible` keeps the promise
    // to a keyboard and drops the one nobody asked for.
    // Comments first: this one names both selectors to say why, and a prose
    // block mentioning a selector reads as a rule using one.
    const rules = CSS.replace(/\/\*[\s\S]*?\*\//g, "");
    const shows = [...rules.matchAll(/([^{}]+)\{([^}]*)\}/g)].filter(
      ([, selector, body]) =>
        selector!.includes(".node__tip") && /visibility:\s*visible/.test(body!),
    );
    expect(shows).toHaveLength(1);
    expect(shows[0]![1]).toContain(":focus-visible");
    expect(shows[0]![1]).not.toContain(":focus-within");
  });

  it("gives an unmet junction something to hide the lines behind it", () => {
    // Hollow, the wires converging on a branch point were visible through the
    // middle of it. The ground colour reads as empty and occludes; `opacity`
    // would fade the fill with everything else and put them back.
    const polygon = CSS.match(/\.junction polygon\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(polygon).toMatch(/fill:\s*var\(--ground/);
    expect(polygon).not.toMatch(/fill:\s*none/);

    const faded = CSS.match(/\.junction\[data-status="unsatisfiable"\]\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(faded).not.toMatch(/opacity/);
  });

  /**
   * Hades I slices rarity off the row's top-left corner and Hades II slabs the
   * whole entry. Read out of the stylesheet for the reason the Loadout's wedge
   * is: the rule that breaks it is one line in the base forgetting there are
   * two games.
   *
   * Both paint on the row's own `::before` rather than as its background. On a
   * card the row carries the card's padding, so a background stopped at the
   * content box and drew a second frame inside the first.
   */
  it("slabs a Hades II boon row and slices a Hades I one", () => {
    const rule = (selector: string) => {
      const literal = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return CSS.match(new RegExp(`${literal}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
    };

    const layer = rule(".boonrow[data-treatment]::before");
    expect(layer, "the tint is not a layer over the row's own box").toMatch(
      /position:\s*absolute/,
    );
    expect(layer).toMatch(/inset:\s*0/);

    const hades2 = rule('.boonrow[data-game="hades2"][data-treatment]::before');
    expect(hades2, "Hades II's row is not tinted").toMatch(/background:\s*linear-gradient/);

    // The slice's width is its height times the ratio the game draws, so it
    // holds at every card height; a literal would hold at exactly one.
    const hades1 = rule('.boonrow[data-game="hades1"][data-treatment]::before');
    expect(hades1, "Hades I's row does not take a slice").toMatch(/clip-path:\s*polygon\(/);
    expect(hades1).toMatch(/aspect-ratio:\s*1\.3/);
    expect(hades1).not.toMatch(/border-right/);
  });

  /**
   * An L: the list sits beside the control with its first entry level with it,
   * and the rest drop from there, so the pointer moves right once and then
   * straight down. Capped and scrolling because seventeen rows is taller than a
   * laptop viewport, and a list running off the bottom is worse than one that
   * scrolls.
   */
  it("opens the picker's list beside the control, not under it", () => {
    const rule = (selector: string) => {
      const literal = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return CSS.replace(/\/\*[\s\S]*?\*\//g, "").match(
        new RegExp(`${literal}\\s*\\{([^}]*)\\}`),
      )?.[1] ?? "";
    };

    const list = rule(".godpicker__list");
    expect(list).toMatch(/left:\s*100%/);
    expect(list).toMatch(/top:\s*0/);
    expect(list).toMatch(/flex-direction:\s*column/);
    // No margin between the two, or the pointer crosses a gap on its way in and
    // the crossing closes the list.
    expect(list).toMatch(/margin:\s*0/);
    expect(list).toMatch(/overflow-y:\s*auto/);

    // A row rather than a tile, which is what tells it apart from the tab it
    // will become: the symbol at the left and the name beside it.
    const god = rule(".godpicker__god");
    expect(god).toMatch(/display:\s*flex/);
    expect(god).toMatch(/text-align:\s*left/);
  });

  /**
   * The picker is drawn only where a pointer can hover, and its half of that
   * pairing is here — the other half hides the native select in the page's own
   * stylesheet. Gated on the capability rather than on a width: a touch screen
   * has no way to open a list by hovering whatever size it is.
   */
  it("draws the god picker only where there is a pointer to hover with", () => {
    const rules = CSS.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(rules).toMatch(/\.godpicker\s*\{[^}]*display:\s*none/);

    const hoverable = rules.match(/@media \(hover: hover\) \{([\s\S]*?)\n\}/);
    expect(hoverable?.[1], "no hover query to turn it back on").toMatch(
      /\.godpicker\s*\{[^}]*display:\s*inline-block/,
    );
  });

  /**
   * Everything a surface writes is at least 0.85rem, and the boon's name is the
   * one exemption — the widest name reaching a page is 21 characters and it
   * already wraps in its 7.5rem column. A floor rather than a fixed scale: what
   * was reported is that the small end was too small.
   */
  it("keeps every size off the floor except the boon's name", () => {
    const rules = CSS.replace(/\/\*[\s\S]*?\*\//g, "");
    const sized = [...rules.matchAll(/([^{}]+)\{([^}]*)\}/g)].flatMap(([, selector, body]) =>
      [...body!.matchAll(/font-size:\s*([\d.]+)rem/g)].map((m) => ({
        selector: selector!.trim().replace(/\s+/g, " "),
        rem: Number(m[1]),
      })),
    );
    expect(sized.length).toBeGreaterThan(15);

    const name = sized.filter((rule) => rule.selector === ".node__name");
    expect(name).toEqual([{ selector: ".node__name", rem: 0.78 }]);

    for (const rule of sized) {
      if (rule.selector === ".node__name") continue;
      expect(rule.rem, `${rule.selector} is ${rule.rem}rem`).toBeGreaterThanOrEqual(0.85);
    }
  });

  it("takes its shape from the game and from nothing else", () => {
    // Shape follows the artwork: Hades I draws boons as diamonds and Hades II
    // as rounded squares, and one silhouette for both crops 44% off every
    // Hades II icon. What shape still never says is what kind of boon this is --
    // a Duo and a Legendary look alike inside one game. So the two shapes are
    // allowed, and the thing worth guarding is what may choose between them.
    //
    // The rarity slice is the one literal shape and is named here rather than
    // waved through: it is a tint behind a Codex row, not a silhouette, and a
    // second one appearing anywhere still fails.
    const clipped = [...CSS.matchAll(/([^{}]+)\{[^}]*clip-path:\s*([^;]+);/g)].map((m) => ({
      selector: m[1]!.trim().split("\n").pop()!.trim(),
      shape: m[2]!.trim(),
    }));
    const silhouettes = clipped.filter((rule) => rule.shape !== "var(--node-clip)");
    expect(silhouettes.map((rule) => rule.selector)).toEqual([
      '.boonrow[data-game="hades1"][data-treatment]::before',
    ]);

    // Comments first: this file explains itself at length, and a prose block
    // mentioning a property reads as a rule setting one.
    const rules = CSS.replace(/\/\*[\s\S]*?\*\//g, "");
    const choosers = [...rules.matchAll(/([^{}]+)\{([^}]*)\}/g)]
      .filter(([, , body]) => /--node-(clip|radius)\s*:/.test(body!))
      .map(([, selector]) => selector!.trim().replace(/\s+/g, " "));
    // A base for the node and a base for the loadout tile, which is not inside
    // one, then a single override naming the game. Anything keyed on state or
    // rarity would be shape-as-type coming back in through the stylesheet.
    expect(choosers).toEqual([
      ".node",
      '.node[data-game="hades2"], .loadout__tile[data-game="hades2"]',
      ".loadout__tile",
    ]);
  });

  it("reserves exactly what the element row occupies, and not on the panel", () => {
    // The row is drawn only while the panel is open and its place is held while
    // it is not. The two lengths have to match or the boons shift by the
    // difference, so both read the same pair of properties rather than a
    // literal.
    //
    // The reserve is the heading's bottom margin, not the panel's top one:
    // adjacent siblings collapse to the larger of their two margins, so a
    // reserve on the panel swallowed the heading's own gap and dropped the
    // panel's bottom edge by exactly that much on opening.
    const rules = CSS.replace(/\/\*[\s\S]*?\*\//g, "");
    const row = rules.match(/\.loadout__elements\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(row).toContain("height: var(--elements-height)");
    expect(row).toContain("margin: 0 0 var(--elements-gap)");

    const heading =
      rules.match(/\.loadout\[data-game="hades2"\]:not\(\[data-open\]\) h2\s*\{([^}]*)\}/)?.[1] ??
      "";
    const flat = heading.replace(/\s+/g, " ");
    expect(flat).toContain("var(--elements-height)");
    expect(flat).toContain("var(--elements-gap)");
    expect(flat).toContain("var(--heading-gap)");

    // And nothing reserves it on the panel, which is where it collapsed.
    expect(rules).not.toMatch(/\.loadout__panel[^{]*\{[^}]*margin-top/);

    // The panel holds one child, so its own gap cannot land between the row and
    // the grid: measured, a row sitting beside the stack rather than inside it
    // collected that gap on top of the reserve and shifted the boons 14.4px.
    const stack = rules.match(/\.loadout__stack\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(stack).toContain("flex: 1 1 auto");
  });


  it("gives the loadout's two columns one row template", () => {
    // They stand side by side and are read across, so a rung in one has to be
    // level with the rung beside it. A flex column sizes each rung to its own
    // content and the grid beside it sizes whole rows, which is what put the
    // right-hand column a little low.
    const rules = CSS.replace(/\/\*[\s\S]*?\*\//g, "");
    const rows = (selector: string) => {
      const body = rules.match(new RegExp(`\\${selector}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
      return /grid-template-rows:\s*([^;]+);/.exec(body)?.[1]?.trim();
    };
    expect(rows(".loadout__core")).toBeDefined();
    expect(rows(".loadout__core")).toBe(rows(".loadout__rest"));
  });
});

/**
 * Have against need on a goal's requirement.
 *
 * **The words carry it and there is no marker beside them.** A dot saying the
 * same thing as the text it sits next to is a second thing to decode for
 * nothing, so the heading takes the colour and the dot is gone.
 *
 * The structural half survives one level down and one level up, which is what
 * this checks as well: every boon under a heading is filled or hollow for held
 * against not held, and the card's own pin is filled or hollow for the goal.
 */
describe("a requirement row's have-against-need", () => {
  /**
   * The body of the rule whose selector this *is*, not of the first rule that
   * mentions it — a selector naming another class in a `:not()` would otherwise
   * be found first and the assertion would be about the wrong declarations.
   */
  function rule(selector: string): string {
    const at = CSS.indexOf(`\n${selector} {`);
    if (at === -1) throw new Error(`no rule for ${selector}`);
    return CSS.slice(CSS.indexOf("{", at) + 1, CSS.indexOf("}", at));
  }

  /**
   * The heading carries neither a marker nor a hue. Both said what the boons
   * under it already say by being lit or dim, and a card whose text is coloured
   * two ways is a card where the words are the last thing you read.
   */
  it("draws no marker beside the heading and no colour on it", () => {
    expect(CSS).not.toMatch(/\.goal__ask::before/);
    expect(rule(".goal__ask")).not.toMatch(/(^|[\s;])color\s*:/);
    // No rule anywhere in a card paints its words green or purple.
    expect(CSS).not.toMatch(/\.goal__row\[data-met=[^{}]*\{[^}]*color\s*:\s*#/);
  });

  /**
   * The one row with nothing underneath it — an element count, a keepsake, a god
   * in the pool — takes the brightness its options would have carried, or it is
   * the only row on the panel with no state at all.
   */
  it("gives a row that names no boon the treatment its options would have", () => {
    expect(rule('.goal__row[data-met="false"]:not(:has(.goal__options))')).toMatch(
      /opacity\s*:/,
    );
  });

  /**
   * The symbol above the list carries which god's boons these are, so a hue on
   * the names would be identity and state in one channel — which is the same
   * mistake the ladder exists not to make.
   */
  it("leaves the option text neutral and structural", () => {
    expect(rule(".goal__option")).not.toMatch(/(^|[\s;])color\s*:/);
    expect(rule('.goal__option[data-held="false"]')).not.toMatch(/(^|[\s;])color\s*:/);
    // Held against not held is brightness and a filled marker, no hue at all.
    expect(rule('.goal__option[data-held="false"]')).toMatch(/opacity\s*:/);
    expect(rule(".goal__option::before")).toMatch(/border\s*:/);
    expect(rule('.goal__option[data-held="true"]::before')).toMatch(/background\s*:/);
  });

  /** The card's pin is where the two colours live now, and the only place. */
  it("gives the card's pin the same two colours", () => {
    const pending = rule(".goal__marker");
    const done = rule('.goal__marker[data-met="true"]');
    expect(pending).toMatch(/color\s*:\s*#/);
    expect(done).toMatch(/color\s*:\s*#/);
    expect(pending).not.toBe(done);
  });

  /**
   * The choices meet the heading's words, not the symbol beside them, and both
   * read one pair of properties — a literal in either place is the indent
   * drifting off the text the next time the symbol is resized, which is the
   * defect this whole rule came out of.
   */
  it("indents the choices past the symbol by the symbol's own width", () => {
    expect(rule(".goal__options")).toMatch(/calc\(var\(--ask-icon\) \+ var\(--ask-gap\)\)/);
    expect(rule(".goal__godart")).toMatch(/var\(--ask-icon\)/);
    expect(rule(".goal__ask")).toMatch(/gap:\s*var\(--ask-gap\)/);
  });

  /**
   * `hidden` is `display: none` in the user-agent sheet and *any* `display` on
   * the element beats it, so the flex column above kept every card open while
   * the attribute was there and doing nothing. Nothing failed — the runner
   * computes no visibility, so asserting the attribute passes either way, which
   * is why this is asserted against the stylesheet instead.
   */
  it("lets the hidden attribute actually hide the rows", () => {
    expect(rule(".goal__rows[hidden]")).toMatch(/display:\s*none/);
  });
});

/**
 * The shortcut list's own two rules, both of which are about position and so
 * cannot be seen by the runner rendering it: jsdom computes no layout, so a
 * test that measured either would be measuring nothing.
 */
describe("the shortcut list", () => {
  function bodyOf(selector: string): string {
    const literal = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const rules = CSS.replace(/\/\*[\s\S]*?\*\//g, "");
    return rules.match(new RegExp(`(^|[{}])\\s*${literal}\\s*\\{([^}]*)\\}`, "m"))?.[2] ?? "";
  }

  /** The title starts where the way out does rather than under it. */
  it("puts the title and the close control on one row", () => {
    expect(bodyOf(".shortcuts")).toMatch(/display:\s*grid/);
    expect(bodyOf(".shortcuts")).toMatch(/align-items:\s*start/);
    expect(bodyOf(".shortcuts .sheet__close")).toMatch(/grid-area:\s*1 \/ 2/);
    expect(bodyOf(".shortcuts h2")).toMatch(/grid-area:\s*1 \/ 1/);
    // The stacking margin the close control carries everywhere else would push
    // it off that row by exactly its own height.
    expect(bodyOf(".shortcuts .sheet__close")).toMatch(/margin:\s*0/);
  });

  it("keeps the list itself across both columns", () => {
    expect(bodyOf(".shortcuts__list")).toMatch(/grid-column:\s*1 \/ -1/);
  });
});
