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
 * Opens one boon's detail surface, selecting its god's tab first — which is
 * also an assertion that every boon is reachable through the tabs, including
 * the ones the data attributes to no god at all.
 */
function open(trait: string): void {
  const record = H2[trait];
  showGod(record?.god ?? "Duos & others");

  const name = record?.name ?? trait;
  const node = [...container.querySelectorAll<HTMLElement>("button")].find((button) =>
    button.getAttribute("aria-label")?.startsWith(`${name} —`),
  );
  if (node === undefined) throw new Error(`no node for ${trait}`);
  act(() => node.click());
}

describe("marking a boon", () => {
  it("writes it into the run and shows it in the Loadout", async () => {
    await mount();
    expect(container.querySelector(".loadout__empty")).not.toBeNull();

    open(APHRODITE_MELEE);
    // The record declares four rarities, so the question is the control rather
    // than a dialog in front of it.
    click("Rare");

    expect(texts(".loadout__name")).toContain(H2[APHRODITE_MELEE]?.name);
    expect(texts(".loadout__rarity")).toContain("Rare");
  });

  /**
   * The rarity a run stores is otherwise `mark`'s fallback — the first the
   * record declares — which is a value nobody observed presented as one they
   * did.
   */
  it("stores the rarity the player chose rather than the first declared", async () => {
    await mount();
    open(APHRODITE_MELEE);
    click("Heroic");

    expect(texts(".loadout__rarity")).toContain("Heroic");
    expect(H2[APHRODITE_MELEE]?.rarity[0]).not.toBe("Heroic");
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
    open(APHRODITE_MELEE);
    click("Common");
    open(APHRODITE_MELEE);

    expect(control("I mis-tapped")).toBeDefined();
    expect(control("I lost it in game")).toBeDefined();
  });

  it("says what a mark would displace, and which goal wanted it", async () => {
    await mount();
    // Island Getaway asks for an Aphrodite boon by name, so pinning it makes
    // the displaced boon a prerequisite of something the player is holding.
    open(APHRODITE_MELEE);
    click("Common");
    open("AllCloseBoon");
    click("Set as goal");

    open(ARES_MELEE);
    const said = container.querySelector(".sheet__displaces")?.textContent ?? "";
    expect(said).toContain(`Taking this replaces ${H2[APHRODITE_MELEE]?.name}`);
    expect(said).toContain(H2.AllCloseBoon?.name ?? "Island Getaway");
  });
});

describe("the undo offer", () => {
  it("names the last edit and takes it back", async () => {
    await mount();
    open(APHRODITE_MELEE);
    click("Common");

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
    open("AllCloseBoon");
    click("Set as goal");

    expect(container.querySelector(".toast__what")?.textContent).toContain("Pinned");
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
    expect(texts(".loadout__name")).toContain(H2[APHRODITE_MELEE]?.name);
    expect(container.querySelector(".override-marker")).not.toBeNull();

    open(APHRODITE_MELEE);
    click("Hand it back");
    // Handed back, the source has nothing to repopulate it with — which is the
    // honest answer for a source that only ever reported what was typed.
    expect(container.querySelector(".loadout__empty")).not.toBeNull();
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
    open(APHRODITE_MELEE);
    click("Common");
    await act(async () => {
      await Promise.resolve();
    });

    expect(texts(".notice__title")).toContain("This run isn't being saved.");
    // The edit was still accepted: the screen is right, only the reload is at
    // risk.
    expect(texts(".loadout__name")).toContain(H2[APHRODITE_MELEE]?.name);
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
    open(APHRODITE_MELEE);
    click("Common");

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
    open(APHRODITE_MELEE);
    click("Common");

    await act(async () => {
      control("End run").click();
    });

    expect(texts(".notice__title")).toContain("That didn't work.");
    expect(texts(".loadout__name")).toContain(H2[APHRODITE_MELEE]?.name);
  });
});

describe("what the boon list shows", () => {
  /**
   * Around a fifth of each game's records have no entry in the localized text
   * bundle — debug entries, inheritance templates, cut content — and the name
   * resolver rightly falls back to the id. That is the right answer for a label
   * on something already on screen and the wrong one for a browsable list,
   * where it offers `BaseCurse` as a boon to take.
   */
  it("leaves out records the game has no name for, keepsakes and weapon forms", async () => {
    await mount();
    click("Duos & others");
    const labels = [...container.querySelectorAll(".node__name")].map((el) => el.textContent);

    expect(labels).toContain(H2.AllCloseBoon?.name);
    expect(labels).not.toContain("BaseCurse");
    expect(labels).not.toContain("MetaUpgradeTrait");
    // A keepsake is equipped, not taken, and in this game is also a trait
    // record under the same id.
    expect(labels).not.toContain("Bone Hourglass");
    // A form is refused by `mark` outright, so offering one would be offering a
    // gesture designed to fail.
    expect(labels).not.toContain("Aspect of Melinoë");
  });

  /**
   * What is still in the list and should not be, pinned rather than left to be
   * rediscovered: costumes and Chaos blessings are trait records like any
   * other, and nothing in the catalog marks the difference between "a thing the
   * game offers you as a boon" and "a trait record". The three exclusions above
   * are the ones that can be made from data that exists; this one needs a
   * marker that does not, so it is a finding rather than a filter.
   *
   * This test is expected to change the day that marker arrives.
   */
  it("still lists costumes and Chaos records, which no field can tell from boons", async () => {
    await mount();
    click("Duos & others");
    const labels = [...container.querySelectorAll(".node__name")].map((el) => el.textContent);

    expect(labels).toContain("Lavender Dress");
    expect(labels).toContain("Excruciating");
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

    open(APHRODITE_MELEE);
    click("Common");
    expect(
      container.querySelector<HTMLElement>('.app__gods button[data-pooled="true"]')?.textContent,
    ).toBe("Aphrodite");

    // Correcting the mis-tap takes Aphrodite back out of the pool; the tab
    // stays, because it is the player's and not the pool's.
    open(APHRODITE_MELEE);
    click("I mis-tapped");
    expect(shown()).toContain("Aphrodite");
    expect(container.querySelector('.app__gods button[data-pooled="true"]')).toBeNull();
  });
});
