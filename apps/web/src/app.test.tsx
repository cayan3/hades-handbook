/**
 * @vitest-environment jsdom
 *
 * The app over a real source, a real overlay and the shipped catalog — with a
 * store in memory, which is the only part faked. Everything asserted here is
 * something no unit test could see: whether a tap reaches the run, whether a
 * field with no view got one, and whether reading through the layer rather than
 * the source is what the components actually do.
 */

import { traitsFor } from "@repo/catalog";
import {
  type RunSlot,
  type RunStore,
  type TabPresence,
  STORE_VERSION,
  createMemoryStore,
  emptyRun,
  openManualSource,
  shippedCatalog,
  toPersisted,
} from "@repo/sync";
import { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { App } from "./app.js";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

/** Two Hades II Melee boons: taking the second displaces the first. */
const APHRODITE_MELEE = "AphroditeWeaponBoon";
const ARES_MELEE = "AresWeaponBoon";
const H2 = traitsFor("hades2");

/** The build the shipped snapshot came from, which a stored run is stamped with. */
function currentBuild(): string {
  return shippedCatalog("hades2").dataVersion;
}

let container: HTMLElement;
let root: Root;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

/**
 * Mounts and lets the session's load settle. Opening is asynchronous — it reads
 * a store — so a render alone shows the loading state and nothing else.
 */
async function mount(store: RunStore = createMemoryStore(), persistent = true): Promise<void> {
  await act(async () => {
    root.render(<App store={store} presence={null} persistent={persistent} />);
  });
}

function texts(selector: string): string[] {
  return [...container.querySelectorAll(selector)].map((el) => el.textContent ?? "");
}

/** The first control whose text is exactly this. */
function control(label: string): HTMLElement {
  const found = [...container.querySelectorAll<HTMLElement>("button")].find(
    (button) => button.textContent?.trim() === label,
  );
  if (found === undefined) {
    throw new Error(
      `no control "${label}"; there is ${texts("button").map((t) => `"${t.trim()}"`).join(", ")}`,
    );
  }
  return found;
}

/**
 * The Loadout is tiles rather than rows now, so what it says is the accessible
 * name of each tile — which is the promise the linear surface actually makes.
 */
function loadout(): string[] {
  return [...container.querySelectorAll<HTMLElement>(".loadout__tile button")].map(
    (button) => button.getAttribute("aria-label") ?? "",
  );
}

function heldInLoadout(trait: string): boolean {
  const name = H2[trait]?.name ?? trait;
  return loadout().some((label) => label.startsWith(`${name} —`));
}

function click(label: string): void {
  act(() => control(label).click());
}

/**
 * Selects a god's tab, adding it through the picker if the run has not met them.
 *
 * The bar carries the gods this run met plus whatever the player added, because
 * all seventeen at once is a list rather than navigation — so reaching an
 * unmet god goes through the picker, which is the path a planning player takes.
 */
function showGod(name: string): void {
  const tab = [...container.querySelectorAll<HTMLElement>(".app__gods button")].find(
    (button) => button.textContent?.trim() === name,
  );
  if (tab !== undefined) {
    act(() => tab.click());
    return;
  }
  const picker = container.querySelector<HTMLSelectElement>(".app__addgod select");
  if (picker === null) throw new Error(`no tab for ${name} and no picker to add one`);
  act(() => {
    picker.value = name;
    picker.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

/**
 * Reveals the Duo/Godsent-Hex rim, which the god page keeps behind a control:
 * it is the one band that is not this god's own ladder, and a player reading
 * one god is usually not reading it.
 */
function showRim(): void {
  const toggle = [...container.querySelectorAll<HTMLInputElement>(".godpage__toggle input")].find(
    (input) => input.closest("label")?.textContent?.includes("Show Duos"),
  );
  if (toggle !== undefined && !toggle.checked) act(() => toggle.click());
}

/**
 * One boon's node, with its god's tab selected first — which is also an
 * assertion that every boon is reachable through the tabs. A Duo names no
 * single god and is reached through either of the two it belongs to.
 */
function node(trait: string): HTMLElement {
  const record = H2[trait];
  const god = record?.god ?? record?.duoGods?.[0];
  if (god === undefined) throw new Error(`${trait} belongs to no god and has no tab`);
  showGod(god);
  showRim();

  const name = record?.name ?? trait;
  const found = [...container.querySelectorAll<HTMLElement>("button")].find((button) =>
    button.getAttribute("aria-label")?.startsWith(`${name} —`),
  );
  if (found === undefined) throw new Error(`no node for ${trait}`);
  return found;
}

/**
 * A click, which is the whole marking gesture: a boon the run does not have is
 * marked, and one it does opens its details. The same event either way, which
 * is the point — a player taps the thing they mean.
 */
function tap(trait: string): void {
  // Resolved before the act, never inside it: `node` selects the god's tab,
  // which is itself an act, and a nested one does not flush until the outer
  // one finishes — so the node would be looked for on the previous tab.
  const control = node(trait);
  act(() => control.click());
}

/**
 * Sets or clears a goal. A right-click on a pointer and a long press on a touch
 * screen both raise `contextmenu`, which is why it is one handler rather than a
 * double-tap that would have to delay the mark to recognise itself.
 */
function goal(trait: string): void {
  const control = node(trait);
  act(() => {
    control.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
  });
}

describe("marking a boon", () => {
  it("writes it into the run and shows it in the Loadout", async () => {
    await mount();
    expect(container.querySelector(".loadout__empty")).not.toBeNull();

    // One tap and it is in the run. No dialog, no question in front of it.
    tap(APHRODITE_MELEE);
    expect(heldInLoadout(APHRODITE_MELEE)).toBe(true);

    // Tapping it again opens the details, which is where the rarity the mark
    // had to guess gets corrected. Rarity is a colour behind the tile, with the
    // name still in the tile's description rather than in a column of text.
    tap(APHRODITE_MELEE);
    click("Rare");
    expect(container.querySelector('.loadout__tile[data-treatment="Rare"]')).not.toBeNull();
  });

  /**
   * The rarity a run stores is otherwise `mark`'s fallback — the first the
   * record declares — which is a value nobody observed presented as one they
   * did.
   */
  it("stores the rarity the player chose rather than the first declared", async () => {
    await mount();
    tap(APHRODITE_MELEE);
    tap(APHRODITE_MELEE);
    click("Heroic");

    expect(container.querySelector('.loadout__tile[data-treatment="Heroic"]')).not.toBeNull();
    expect(H2[APHRODITE_MELEE]?.rarity[0]).not.toBe("Heroic");
  });
});

describe("marking opens nothing", () => {
  /**
   * The contract the marking test above left unasserted: a tap on a boon the
   * run does not have marks it and puts *no* surface in front of the player.
   * The test beside it proved the write landed and never that the screen
   * stayed clear, which is the half a report of the opposite would land on.
   */
  it("opens no dialog on the tap that marks", async () => {
    await mount();
    tap(APHRODITE_MELEE);
    expect(heldInLoadout(APHRODITE_MELEE)).toBe(true);
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(container.querySelector(".sheet-scrim")).toBeNull();
  });
});

describe("the three ways a boon leaves a run", () => {
  /**
   * The distinction is load-bearing in the run and invisible in a mock: a
   * mis-tap never happened, so the god goes back out of the pool; a boon lost
   * in game was really taken, so the god stays. One "remove" control would pick
   * one silently and under-report the pool for the rest of the run.
   */
  it("offers the mis-tap and the loss as separate controls", async () => {
    await mount();
    tap(APHRODITE_MELEE);
    tap(APHRODITE_MELEE);

    expect(control("I mis-tapped")).toBeDefined();
    expect(control("I lost it in game")).toBeDefined();
  });

  /**
   * Displacement still happens and is still recorded: a second Melee boon takes
   * the first out of the run entirely, so it stops counting toward everything
   * that named it.
   *
   * **The warning moved rather than going away.** It used to be announced in
   * the detail surface *before* the mark, and a one-tap mark has no before. It
   * was never a choice either — a control that could refuse a displacement
   * would refuse ordinary play — so it now reads beside the undo, which is the
   * one place the player can actually act on it. The derivation is
   * intact; what changed is where it is said.
   */
  it("displaces the boon in the slot and says so beside the undo", async () => {
    await mount();
    // Island Getaway asks for an Aphrodite boon by name, so pinning it is what
    // used to make the warning worth reading.
    tap(APHRODITE_MELEE);
    goal("AllCloseBoon");
    tap(ARES_MELEE);

    expect(heldInLoadout(ARES_MELEE)).toBe(true);
    expect(heldInLoadout(APHRODITE_MELEE)).toBe(false);

    // The sentence is beside the undo rather than ahead of the tap, and both
    // halves are there: what left the run, and which goal wanted it.
    const said = container.querySelector(".toast__cost")?.textContent ?? "";
    expect(said).toContain(`Taking this replaces ${H2[APHRODITE_MELEE]?.name}`);
    expect(said).toContain(H2.AllCloseBoon?.name ?? "Island Getaway");
  });

  /**
   * The short half of the same sentence, on the node, before the tap. It reads
   * `facts.slots` and nothing else, which is what lets it ride on a view the
   * cache keys by facts identity.
   */
  it("warns on the node before the tap, without naming a goal", async () => {
    await mount();
    tap(APHRODITE_MELEE);

    const tip = node(ARES_MELEE).parentElement?.querySelector(".node__tip");
    expect(tip?.textContent).toBe(`Taking this replaces ${H2[APHRODITE_MELEE]?.name}.`);
  });

  /** Nothing to say where nothing was pushed out. */
  it("says nothing about displacement when the slot was free", async () => {
    await mount();
    tap(APHRODITE_MELEE);
    expect(container.querySelector(".toast__cost")).toBeNull();
  });
});

describe("the undo offer", () => {
  it("names the last edit and takes it back", async () => {
    await mount();
    tap(APHRODITE_MELEE);

    expect(container.querySelector(".toast__what")?.textContent).toBe(
      `Marked ${H2[APHRODITE_MELEE]?.name}`,
    );

    click("Undo");
    expect(container.querySelector(".loadout__empty")).not.toBeNull();
  });

  /**
   * A pin is intent, which the port cannot carry — so before the second
   * subscription existed, pinning updated nothing on screen.
   */
  it("appears for an intent edit, which no fact records", async () => {
    await mount();
    goal("AllCloseBoon");

    expect(container.querySelector(".toast__what")?.textContent).toContain("Pinned");
    // The panel is shut until it is asked for, so the pin has to be visible
    // through the count on the control before it is visible in the list.
    expect(control("Goals (1)")).toBeDefined();
    click("Goals (1)");
    expect(texts(".goal__name")).toContain(H2.AllCloseBoon?.name);
  });
});

describe("what a load could not carry", () => {
  async function storeHolding(record: unknown, slot: RunSlot = "active"): Promise<RunStore> {
    const store = createMemoryStore();
    await store.save("hades2", slot, record as never);
    return store;
  }

  it("explains a run set aside because this build could not read it", async () => {
    const store = await storeHolding({ storeVersion: STORE_VERSION + 9, facts: {}, intent: {} });
    await mount(store);

    expect(texts(".notice__title")).toContain("Your saved run couldn't be opened.");
    // Set aside rather than deleted, which is the half that decides whether a
    // player closes the tab in a panic.
    expect(await store.load("hades2", "unreadable")).not.toBeNull();
  });

  it("owes a migration notice until it is accepted, not until the next tap", async () => {
    const stale = emptyRun("hades2", "an-older-build");
    stale.facts.held.set("GoneInThisBuild", { rarity: "Common", level: 1 });
    stale.intent.notes.set("GoneInThisBuild", "save this for the Hera duo");
    const store = await storeHolding(toPersisted({ state: stale, quarantine: [] }));

    await mount(store);
    expect(texts(".notice__title")).toContain("This run predates a game update.");
    // The player's own sentence is the one thing worth showing verbatim.
    expect(texts(".notice__notes li")).toContain("save this for the Hera duo");

    // Still owed across a reload, because nothing accepted it.
    await act(async () => root.render(<></>));
    await mount(store);
    expect(texts(".notice__title")).toContain("This run predates a game update.");

    click("Carry on anyway");
    expect(texts(".notice__title")).not.toContain("This run predates a game update.");
  });
});

describe("a field the user is holding by hand", () => {
  /**
   * The override layer is real and wired, and **nothing in v1 can produce an
   * override**: every fact a manual run holds was typed by the player, so there
   * is no live source to diverge from. The layer exists for the bridge, which
   * is the same reason the Live Toggle is deliberately not built.
   *
   * So the marker is proved through the one path that does reach it today — an
   * overlay stored with the run and handed back at load — rather than through a
   * control that would have nothing to do.
   */
  it("shows the marker and hands the field back", async () => {
    const stored = toPersisted({ state: emptyRun("hades2", ""), quarantine: [] });
    const store = createMemoryStore();
    await store.save("hades2", "active", {
      ...stored,
      // Stamped with the shipped build so the load has nothing to migrate.
      facts: { ...stored.facts, dataVersion: currentBuild() },
      overrides: [{ path: "held", key: APHRODITE_MELEE, value: { rarity: "Epic", level: 1 } }],
    });

    await mount(store);
    expect(heldInLoadout(APHRODITE_MELEE)).toBe(true);
    expect(container.querySelector(".override-marker")).not.toBeNull();

    tap(APHRODITE_MELEE);
    click("Hand it back");
    // Handed back, the source has nothing to repopulate it with — which is the
    // honest answer for a source that only ever reported what was typed.
    expect(container.querySelector(".loadout__empty")).not.toBeNull();
  });
});

describe("the Goals panel", () => {
  /**
   * A panel rather than a column, so opening and closing it never moves the
   * boons underneath and the layout has one shape at every width. Closed to
   * begin with: it is fixed over the right-hand edge, and opening by default
   * meant a game switch threw it back over the page every time.
   */
  it("stays shut until it is asked for, and can be put away again", async () => {
    await mount();
    expect(container.querySelector(".app__goals")).toBeNull();

    click("Goals");
    expect(container.querySelector(".app__goals")).not.toBeNull();

    // The panel covers the right-hand end of the header, which is where the
    // control that opened it lives — so it needs a way out of its own.
    click("Close");
    expect(container.querySelector(".app__goals")).toBeNull();
  });

  it("counts what is pinned on the control that opens it", async () => {
    await mount();
    goal("AllCloseBoon");

    expect(control("Goals (1)")).toBeDefined();
  });
});

describe("the Loadout", () => {
  /**
   * Styled after the game's own boon menu: the core slots on their own, tiles
   * rather than rows, everything else behind one control. `§5` has asked for
   * the collapsed/expanded pair since the design pass.
   */
  it("shows the core slots first and the rest behind one control", async () => {
    await mount();
    // Island Getaway is a Duo — it fills no slot, so it is not core, and its
    // record declares exactly one rarity, so that is what the control says.
    tap("AllCloseBoon");
    tap(APHRODITE_MELEE);

    expect(heldInLoadout(APHRODITE_MELEE)).toBe(true);
    expect(heldInLoadout("AllCloseBoon")).toBe(false);

    click("Show all boons");
    expect(heldInLoadout("AllCloseBoon")).toBe(true);

    click("Core slots only");
    expect(heldInLoadout("AllCloseBoon")).toBe(false);
  });

  /**
   * Rarity is a colour behind the tile and Common carries none, which is what
   * makes a coloured one mean something — the game's own treatment.
   */
  it("colours a tile by rarity, and leaves Common plain", async () => {
    await mount();
    // A one-tap mark stores the first rarity the record declares, which for
    // this boon is Common — and Common draws nothing, which is what makes a
    // coloured tile mean something.
    tap(APHRODITE_MELEE);
    expect(container.querySelector(".loadout__tile[data-treatment]")).toBeNull();

    tap(APHRODITE_MELEE);
    click("Epic");
    expect(container.querySelector('.loadout__tile[data-treatment="Epic"]')).not.toBeNull();
  });

  /**
   * The art ships, so there is nothing to choose between.
   *
   * The header carried an Artwork checkbox for two sessions, from the round
   * where the art set was two placeholder files. It was a way to look at the
   * other ladder, never a feature — and the fallback ladder is a withdrawal
   * path, which is not a thing a player picks.
   */
  it("draws the real art and offers no way to turn it off", async () => {
    await mount();

    expect(container.querySelector<HTMLElement>(".node")?.dataset["ladder"]).toBe("real-art");
    const controls = [...container.querySelectorAll("label")].map((el) => el.textContent);
    expect(controls.some((text) => text?.includes("Artwork"))).toBe(false);
  });

  /**
   * The core column is read by position, so it is the same column every run
   * whatever order the player filled it in — Attack, Special, Cast, Dash,
   * then the fifth. The boons that hold no slot keep the order they arrived in,
   * because arrival is the only order they have.
   */
  it("keeps the core slots in slot order however they were taken", async () => {
    await mount();
    // Special before Attack, so insertion order and slot order disagree.
    tap("AphroditeSpecialBoon");
    tap(APHRODITE_MELEE);

    const named = loadout().map((label) => label.split(" —")[0]);
    expect(named).toEqual([H2[APHRODITE_MELEE]?.name, H2.AphroditeSpecialBoon?.name]);
  });

  /**
   * The game shows a held boon's text beside the icons rather than over them,
   * and the reason it does is that you are usually comparing — so covering the
   * grid to read one entry is the thing this surface must not do.
   */
  it("opens a boon's card beside the grid rather than over it", async () => {
    await mount();
    // The first tap marks it; the second lands on the tile the mark created.
    tap(APHRODITE_MELEE);
    tap(APHRODITE_MELEE);

    const card = container.querySelector(".loadout__card");
    expect(card?.querySelector(".loadout__cardname")?.textContent).toBe(
      H2[APHRODITE_MELEE]?.name,
    );
    // Beside, not over: the grid it was picked from is still on the page.
    expect(container.querySelectorAll(".loadout__tile")).not.toHaveLength(0);
    expect(container.querySelector(".sheet-scrim")).toBeNull();

    click("×");
    expect(container.querySelector(".loadout__card")).toBeNull();
  });

  /** A card describing a boon nobody holds is a card about nothing. */
  it("closes the card when the boon leaves the run", async () => {
    await mount();
    tap(APHRODITE_MELEE);
    tap(APHRODITE_MELEE);
    expect(container.querySelector(".loadout__card")).not.toBeNull();

    click("I mis-tapped");
    expect(container.querySelector(".loadout__card")).toBeNull();
  });

  /** No names drawn, and every one of them still said. */
  it("draws no name and keeps every name reachable", async () => {
    await mount();
    tap(APHRODITE_MELEE);

    expect(container.querySelector(".loadout .node__name")).toBeNull();
    expect(loadout()[0]).toContain(H2[APHRODITE_MELEE]?.name);
  });
});

describe("another tab of the same run", () => {
  /**
   * Two tabs share one database and write last-one-wins, and v1 does not
   * coordinate them — the warning is the whole mitigation, so it has to arrive
   * when presence says so rather than only when the page is first drawn.
   */
  it("warns while it is open, and stops when it goes away", async () => {
    let open = false;
    const listeners = new Set<(v: boolean) => void>();
    const presence: TabPresence = {
      get otherTabOpen() {
        return open;
      },
      subscribe: (cb) => {
        listeners.add(cb);
        return () => listeners.delete(cb);
      },
      close: () => listeners.clear(),
    };
    const announce = (next: boolean) => {
      open = next;
      act(() => {
        for (const cb of listeners) cb(next);
      });
    };

    await act(async () => {
      root.render(<App store={createMemoryStore()} presence={presence} persistent />);
    });
    expect(texts(".notice__title")).not.toContain("This run is open in another tab.");

    announce(true);
    expect(texts(".notice__title")).toContain("This run is open in another tab.");

    announce(false);
    expect(texts(".notice__title")).not.toContain("This run is open in another tab.");
  });
});

describe("a store that will not take a write", () => {
  function failing(): RunStore {
    const memory = createMemoryStore();
    return {
      load: (game, slot) => memory.load(game, slot),
      clear: (game, slot) => memory.clear(game, slot),
      save: () => Promise.reject(new Error("quota exceeded")),
    };
  }

  /**
   * The difference between a run that is not being saved and one that looks
   * fine. Nothing awaits a tap, so this arrives with no gesture behind it —
   * which is why it needed a subscription of its own before it could be shown
   * at all.
   */
  it("says so, after a tap that nothing awaited", async () => {
    await mount(failing());
    tap(APHRODITE_MELEE);
    await act(async () => {
      await Promise.resolve();
    });

    expect(texts(".notice__title")).toContain("This run isn't being saved.");
    // The edit was still accepted: the screen is right, only the reload is at
    // risk.
    expect(heldInLoadout(APHRODITE_MELEE)).toBe(true);
  });

  it("says so up front when the browser has no storage at all", async () => {
    await mount(createMemoryStore(), false);
    expect(texts(".notice__title")).toContain("This browser won't let the Handbook save.");
  });
});

describe("ending a run", () => {
  it("files it and starts a fresh one", async () => {
    const store = createMemoryStore();
    await mount(store);
    tap(APHRODITE_MELEE);

    await act(async () => {
      control("End run").click();
    });

    expect(container.querySelector(".loadout__empty")).not.toBeNull();
    expect(await store.load("hades2", "last")).not.toBeNull();

    // And the fresh run is the one a reload finds.
    const source = await openManualSource({ game: "hades2", store });
    expect(source.getFacts().held.size).toBe(0);
  });
});

describe("a write that throws", () => {
  /**
   * Ending a run is the one edit that throws where a tap can reach it: it is
   * also the one that discards what it holds, so it refuses to clear anything
   * until both records are written. An exception out of a tap handler unmounts
   * the tree, and a blank screen is a worse answer than a wrong one — so the
   * page has to survive it with the run intact.
   */
  it("keeps the page and the run when the run cannot be filed", async () => {
    const memory = createMemoryStore();
    const store: RunStore = {
      load: (game, slot) => memory.load(game, slot),
      clear: (game, slot) => memory.clear(game, slot),
      save: () => Promise.reject(new Error("quota exceeded")),
    };
    await mount(store);
    tap(APHRODITE_MELEE);

    await act(async () => {
      control("End run").click();
    });

    expect(texts(".notice__title")).toContain("That didn't work.");
    expect(heldInLoadout(APHRODITE_MELEE)).toBe(true);
  });
});

describe("the god page", () => {
  /**
   * The page is a laid-out graph now rather than a list in tier order, and what
   * makes it one is the connectors. They are traced over the bands after layout
   * rather than positioned by it, so this asserts what each is drawn *for*, not
   * where it lands — the runner has no layout and every box measures zero.
   */
  it("draws a god's ladder as bands with a branch point where a gate branches", async () => {
    await mount();
    showGod("Zeus");

    // More than one band, and no band anywhere names the rank that ordered it.
    expect(container.querySelectorAll(".godpage__band").length).toBeGreaterThan(1);
    // A band names itself to a reader and never on the page, so the headings
    // are in the document and out of sight. No tier is named to either.
    expect(container.textContent).not.toMatch(/tier/i);
    expect(texts(".godpage h3")).toEqual(["Infusions"]);
    showRim();
    expect(texts(".godpage h3")).toEqual(["Infusions", "Duos and Godsent Hexes"]);

    // Every junction says what it stands for, and the count is the gate's own
    // rather than the number of lines that happen to reach it here.
    const junctions = [...container.querySelectorAll(".junction")];
    expect(junctions.length).toBeGreaterThan(0);
    for (const junction of junctions) {
      expect(junction.getAttribute("aria-label")).toMatch(/^Any \d+ of \d+ — /);
    }
  });

  /**
   * A page of two dozen boons carries up to 66 connectors and one gate can fan
   * to nine on its own, so the resting page draws none of them and hovering or
   * focusing a node draws its own. Focus rather than hover, because the
   * connectors must not be a thing only a mouse can see.
   */
  it("draws its connectors around whatever has focus, and none at rest", async () => {
    await mount();
    const boon = node("DoubleBoltBoon");
    expect(container.querySelectorAll(".godpage__wire")).toHaveLength(0);

    act(() => boon.focus());
    expect(container.querySelectorAll(".godpage__wire").length).toBeGreaterThan(0);

    act(() => boon.blur());
    expect(container.querySelectorAll(".godpage__wire")).toHaveLength(0);
  });

  /**
   * Tab order is DOM order and nothing sets an index — the only version of that
   * promise that cannot quietly stop being true, and a laid-out canvas is
   * exactly where it usually does.
   */
  it("leaves the graph reachable in reading order", async () => {
    await mount();
    showGod("Zeus");
    expect([...container.querySelectorAll(".godpage [tabindex]")]).toEqual([]);
    // A junction stands for a requirement rather than for a boon; everything it
    // joins is reachable through the nodes it joins.
    expect([...container.querySelectorAll(".junction")].every((j) => !j.matches("button"))).toBe(
      true,
    );
  });
});

describe("what the boon list shows", () => {
  function shownBoons(): (string | null)[] {
    return [...container.querySelectorAll(".node__name")].map((el) => el.textContent);
  }

  /**
   * A Duo answers to two gods, so it is on both their tabs. Collecting toward
   * one happens from two directions and a Duo that appeared under neither god
   * would be reachable only by knowing it exists.
   */
  it("puts a Duo on both of its gods' tabs", async () => {
    await mount();
    // Island Getaway is Aphrodite and Poseidon.
    showGod("Aphrodite");
    showRim();
    expect(shownBoons()).toContain(H2.AllCloseBoon?.name);
    showGod("Poseidon");
    showRim();
    expect(shownBoons()).toContain(H2.AllCloseBoon?.name);
    showGod("Hera");
    showRim();
    expect(shownBoons()).not.toContain(H2.AllCloseBoon?.name);
  });

  /**
   * The one population that could have gone out with the bathwater. An Infusion
   * is element-gated rather than god-gated, so it reads as a candidate for
   * "belongs to nobody" — measured, 10 of this game's 11 carry a god after all,
   * and the one that does not is a Chaos blessing, which is out of v1 scope.
   */
  it("keeps the Infusions, which are gated on an element and not on a god", async () => {
    await mount();
    showGod("Hestia");
    // Slow Cooker: obtainable at a Fire threshold, filed under Hestia.
    expect(shownBoons()).toContain(H2.ElementalBaseDamageBoon?.name ?? "Slow Cooker");
  });

  /**
   * The god is the filter and it is a better one than it looks: a boon is what
   * a god hands you. A record attributed to nobody is a costume, a hammer
   * upgrade, a companion, a Chaos blessing or a weapon-specific trait — 311 of
   * them in this game — and none of those is a boon a run collects.
   *
   * This replaces a test that asserted the opposite. It pinned costumes and
   * Chaos records as a *finding*, on the ground that nothing in the catalog
   * separated a boon from a trait record. The god field does.
   */
  it("lists only what a god hands you", async () => {
    await mount();
    for (const god of ["Aphrodite", "Hera", "Poseidon"]) {
      showGod(god);
      const labels = shownBoons();
      expect(labels).not.toContain("Lavender Dress");
      expect(labels).not.toContain("Excruciating");
      // No display text, so the resolver falls back to the id — right for a
      // label on something already on screen, wrong for a row offering it.
      expect(labels).not.toContain("BaseCurse");
      expect(labels).not.toContain("MetaUpgradeTrait");
      // Equipped rather than taken, and in this game also a trait record.
      expect(labels).not.toContain("Bone Hourglass");
      // Refused by `mark` outright, so listing one offers a gesture designed
      // to fail.
      expect(labels).not.toContain("Aspect of Melinoë");
    }
  });

  /**
   * Seventeen tabs at once is a list rather than navigation, so the bar carries
   * the gods this run has met plus whatever the player added — and once a tab
   * appears it stays, whatever the pool does afterwards. Navigation must not
   * reshuffle under somebody because a boon was removed.
   */
  it("shows the gods a run has met, and keeps a tab once it is there", async () => {
    await mount();
    const shown = () => texts(".app__gods button");
    expect(shown()).not.toContain("Ares");

    // Added for planning, without having met them — and the tab that was
    // showing before does not vanish behind it.
    showGod("Ares");
    expect(shown()).toContain("Ares");
    expect(shown()).toContain("Aphrodite");

    tap(APHRODITE_MELEE);
    expect(
      container.querySelector<HTMLElement>('.app__gods button[data-pooled="true"]')?.textContent,
    ).toBe("Aphrodite");

    // Correcting the mis-tap takes Aphrodite back out of the pool; the tab
    // stays, because it is the player's and not the pool's.
    tap(APHRODITE_MELEE);
    click("I mis-tapped");
    expect(shown()).toContain("Aphrodite");
    expect(container.querySelector('.app__gods button[data-pooled="true"]')).toBeNull();
  });

  /**
   * The case that looks like the one above failing and is not: a god the run
   * still holds a boon of stays in the pool, because they were genuinely met.
   * Worth pinning beside it, since the two are told apart only by how many
   * boons are left.
   */
  it("keeps a god pooled while any of their boons is still held", async () => {
    await mount();
    tap(APHRODITE_MELEE);
    tap("AphroditeSpecialBoon");

    tap(APHRODITE_MELEE);
    click("I mis-tapped");
    expect(container.querySelector('.app__gods button[data-pooled="true"]')).not.toBeNull();

    tap("AphroditeSpecialBoon");
    click("I mis-tapped");
    expect(container.querySelector('.app__gods button[data-pooled="true"]')).toBeNull();
  });
});
