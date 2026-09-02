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
import { STORAGE_ERROR_TITLE } from "@repo/ui";
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
import { GAME_HASH } from "./route.js";

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
  window.location.hash = "";
});

/**
 * Mounts on a game's own route and lets the session's load settle. The bare URL
 * is the site's front page now, which opens no run at all — so everything below
 * would be looking at Home without this. Opening is asynchronous, so a render
 * alone shows the loading state and nothing else.
 */
async function mount(store: RunStore = createMemoryStore(), persistent = true): Promise<void> {
  if (window.location.hash === "") window.location.hash = GAME_HASH.hades2;
  await act(async () => {
    root.render(<App store={store} presence={null} persistent={persistent} />);
  });
  await enterGame();
}

/**
 * Answers the save screen, which stands between a page that is not a game and
 * the game itself. Continuing where there is a run, starting where there is not
 * — neither touches what is stored, so every test below starts where it did
 * before this door existed.
 */
async function enterGame(): Promise<void> {
  /* By what the slot says, never by where it is: the row's order is fixed and
     puts *Start a new run* first, so an index here would replace the run this
     was about to continue. */
  const slots = [...container.querySelectorAll<HTMLElement>(".saves__take")];
  const slot =
    slots.find((button) => button.querySelector(".saves__what")?.textContent === "Continue run") ??
    slots.find(
      (button) => button.querySelector(".saves__what")?.textContent === "Start a new run",
    );
  // Awaited, because starting a run is a write and the door stays up until it
  // lands — a tap made in that window would be wiped by the run arriving.
  if (slot !== undefined) await act(async () => slot.click());
}

/** Follows one of the app's own links, which is how a game is reached now. */
async function follow(hash: string): Promise<void> {
  await act(async () => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });
}

/** A key press on the document, which is where the page-wide commands listen. */
function press(key: string, over: KeyboardEventInit = {}): void {
  act(() => {
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, ...over }));
  });
}

function texts(selector: string): string[] {
  return [...container.querySelectorAll(selector)].map((el) => el.textContent ?? "");
}

/**
 * The bar minus its weapon tabs, which is what every assertion about "the tabs
 * a run has" means. The six weapons are fixed furniture — a closed set, one per
 * game, none of them removable and none of them curated — so counting them
 * would make each of these read a constant it is not about.
 */
const GOD_TABS = ".app__godtab:not(.app__weapontab)";

/** The first control whose text is exactly this. */
function control(label: string, optional: true): HTMLElement | null;
function control(label: string): HTMLElement;
function control(label: string, optional = false): HTMLElement | null {
  const found = [...container.querySelectorAll<HTMLElement>("button")].find(
    (button) => button.textContent?.trim() === label,
  );
  if (optional) return found ?? null;
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
 * The way back to the save screen: its own control in the header, drawn as a
 * door and carrying no text. It files nothing — the door's slots act on the run.
 */
function toTheDoor(): void {
  const door = container.querySelector<HTMLElement>(".app__door");
  if (door === null) throw new Error("no door control");
  act(() => door.click());
}

/** A save-screen slot by what it says, since its index depends on what is stored. */
async function takeSlot(what: string, at = 0): Promise<void> {
  const slots = [...container.querySelectorAll<HTMLElement>(".saves__take")].filter(
    (button) => button.querySelector(".saves__what")?.textContent === what,
  );
  const slot = slots[at];
  if (slot === undefined) throw new Error(`no "${what}" slot`);
  await act(async () => slot.click());
}

/** The whole boundary as a player walks it: to the door, then take a new run. */
async function startNewRun(): Promise<void> {
  toTheDoor();
  await takeSlot("Start a new run");
}

/** What each of the three slots is offering, in slot order. */
function slotLabels(): string[] {
  return [...container.querySelectorAll<HTMLElement>(".saves__slot")]
    .slice(1)
    .map(
      (el) =>
        el.querySelector(".saves__what")?.textContent ??
        el.querySelector(".saves__empty")?.textContent ??
        "",
    );
}

/**
 * The Loadout card keeps its rarities behind a word: correcting one is rarer
 * than reading the card, and four rarities beside a Remove read as four removals.
 */
function editRarity(rarity: string): void {
  click("Edit rarity");
  click(rarity);
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
  act(() => {
    // The hover a pointer always arrives with, which the runner synthesises
    // and a browser does not need told. A Loadout tile is only drawn with its
    // card while the panel has the pointer, so a bare click here would be a
    // sequence no player can produce.
    control.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    control.click();
  });
}

/**
 * The same gesture on the god page's own node rather than on whichever control
 * matches first. It matters for a held boon: the Loadout's tile comes first in
 * the document under the same accessible name, so `tap` finds the tile and opens
 * a card. The sheet is reachable only through the page.
 */
function tapOnPage(trait: string): void {
  const record = H2[trait];
  const god = record?.god ?? record?.duoGods?.[0];
  if (god === undefined) throw new Error(`${trait} belongs to no god and has no tab`);
  showGod(god);
  showRim();

  const name = record?.name ?? trait;
  const found = [...container.querySelectorAll<HTMLElement>(".godpage button")].find((button) =>
    button.getAttribute("aria-label")?.startsWith(`${name} —`),
  );
  if (found === undefined) throw new Error(`no node for ${trait} on the page`);
  act(() => {
    found.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    found.click();
  });
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
    editRarity("Rare");
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
    editRarity("Heroic");

    expect(container.querySelector('.loadout__tile[data-treatment="Heroic"]')).not.toBeNull();
    expect(H2[APHRODITE_MELEE]?.rarity[0]).not.toBe("Heroic");
  });
});

/**
 * The run's element counts, end to end over the shipped catalog.
 *
 * Three surfaces read the same map and each is asserted on its own here,
 * because a change that fixes one and leaves another wrong is exactly what
 * happened: the counts were maintained by nothing, so the row showed five
 * zeroes *and* all 17 element gates read as unmet by a run that had met them.
 * Self Healing is obtainable at 2 Fire and live at 3, so one boon covers the
 * two gates at two different thresholds.
 */
describe("the run's elements", () => {
  /** Three Fire boons with no gate, no slot and no exclusion between them. */
  const FIRE = ["AloneDamageBoon", "BurnExplodeBoon", "ApolloRetaliateBoon"];
  const SELF_HEALING = "ElementalRallyBoon";

  function elementRow(): string[] {
    return [...container.querySelectorAll(".loadout__elements li")].map(
      (li) => li.textContent ?? "",
    );
  }

  /** The row is drawn only while the panel is open, all five and never fewer. */
  function openLoadout(): void {
    const toggle = [...container.querySelectorAll<HTMLElement>("button")].find(
      (button) => button.textContent?.trim() === "Expand",
    );
    if (toggle !== undefined) act(() => toggle.click());
  }

  it("counts one per boon held, and the row says so", async () => {
    await mount();
    for (const trait of FIRE) tap(trait);
    openLoadout();

    // Five entries whatever the run has met, with the count beside each
    // symbol — so the four it has not met read zero rather than going missing.
    expect(elementRow()).toHaveLength(5);
    expect(elementRow().some((entry) => entry.startsWith("3") && entry.includes("Fire"))).toBe(true);
    expect(elementRow().filter((entry) => entry.startsWith("0"))).toHaveLength(4);
  });

  it("counts the boon and not its rarity", async () => {
    await mount();
    tap(FIRE[0] as string);
    // A second tap on a held boon opens its sheet, where the rarity the mark
    // had to guess gets corrected.
    tap(FIRE[0] as string);
    click("Heroic");
    openLoadout();

    // The game's accumulator increments by one and reads no multiplier, so a
    // Heroic is worth exactly what a Common is.
    expect(elementRow().some((entry) => entry.startsWith("1") && entry.includes("Fire"))).toBe(true);
  });

  it("opens the prerequisite gate once the count reaches it", async () => {
    await mount();
    const before = node(SELF_HEALING).getAttribute("aria-label");
    expect(before).not.toContain("Available");

    tap(FIRE[0] as string);
    tap(FIRE[1] as string);

    expect(node(SELF_HEALING).getAttribute("aria-label")).toContain("Available");
  });

  it("clears the dormant badge once the activation count is reached", async () => {
    await mount();
    for (const trait of FIRE.slice(0, 2)) tap(trait);
    tap(SELF_HEALING);

    // Held at 2 Fire, and its effect is gated at 3 — which the game signals
    // with a popup that is gone a second later and nowhere else.
    expect(node(SELF_HEALING).parentElement?.textContent).toContain("not active yet");

    tap(FIRE[2] as string);

    expect(node(SELF_HEALING).parentElement?.textContent).not.toContain("not active yet");
  });

  it("derives the count for a run stored before anything maintained it", async () => {
    // The record this run is built from carries no counts at all, which is what
    // every run written before the derivation looks like. Nothing migrates it:
    // the count is worked out from `held` when the run opens.
    const store = createMemoryStore();
    const state = emptyRun("hades2", currentBuild());
    for (const trait of FIRE) state.facts.held.set(trait, { rarity: "Common", level: 1 });
    await store.save("hades2", "active", toPersisted({ state, quarantine: [] }));

    await mount(store);
    openLoadout();

    expect(elementRow().some((entry) => entry.startsWith("3") && entry.includes("Fire"))).toBe(true);
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
   * mis-tap never happened, so the god goes back out of the pool; a boon lost in
   * game was really taken, so the god stays. The Loadout's card asks it only
   * where it changes anything — the last boon a god has left — and the sheet
   * keeps both, being about one boon rather than about a run.
   *
   * On the card the pool half is a choice under **Remove** rather than a second
   * button beside it, so it takes a click to reach and is absent until then.
   */
  it("offers the pool half of a removal exactly where it changes anything", async () => {
    await mount();
    tap(APHRODITE_MELEE);
    tap(APHRODITE_MELEE);

    expect(control("Remove")).toBeDefined();
    expect(() => control("Remove boon and god from pool")).toThrow();
    click("Remove");
    expect(control("Remove boon and god from pool")).toBeDefined();

    // A second boon from the same god, and the choice stops being one — so
    // Remove goes back to being a button that removes rather than one that asks.
    // Read off `aria-expanded` rather than by clicking it, which would remove.
    tap("AphroditeSpecialBoon");
    tap("AphroditeSpecialBoon");
    expect(control("Remove").getAttribute("aria-expanded")).toBeNull();
    expect(() => control("Remove boon and god from pool")).toThrow();
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
  async function storeHolding(record: unknown, slot: RunSlot = 1): Promise<RunStore> {
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

  /**
   * The one line on the panel about the goals *together*. Island Getaway and
   * Carnal Pleasure both accept an Aphrodite boon, so one mark is a step toward
   * both — which is the whole of what the strip is for.
   *
   * Two boons tie exactly here: the pair shares Flutter Strike and Flutter
   * Flourish and nothing else, and either satisfies both any-ofs. So this
   * asserts the tie-break rather than a preference — `AphroditeSpecialBoon`
   * sorts first, and it sorting first every time is the property that keeps the
   * strip from swapping between them on an unrelated re-render.
   */
  it("names the boon two goals both want", async () => {
    await mount();
    goal("AllCloseBoon");
    goal("BloodManaBurstBoon");
    click("Goals (2)");

    const strip = container.querySelector(".goals__best")?.textContent ?? "";
    expect(strip).toContain(H2.AphroditeSpecialBoon?.name);
    // The goals it serves by name, and in the boon's own god's colour.
    expect(strip).toContain(
      `fulfills requirements for ${H2.AllCloseBoon?.name}, ${H2.BloodManaBurstBoon?.name}`,
    );
    expect(container.querySelector<HTMLElement>(".goals__pick")?.style.color).not.toBe("");
  });

  /**
   * The panel is unmounted while it is closed, so a card that forgot it was
   * open every time the panel was put away would be a click undone by looking
   * away — which is why the held set lives above the panel.
   */
  it("keeps a card held open across closing and reopening the panel", async () => {
    await mount();
    goal("AllCloseBoon");
    click("Goals (1)");

    act(() => {
      container.querySelector(".goal__summary")?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });
    expect(container.querySelector(".goal")?.getAttribute("data-held-open")).toBe("true");

    click("Close");
    click("Goals (1)");
    expect(container.querySelector(".goal")?.getAttribute("data-held-open")).toBe("true");

    // And it is a toggle: the click that opened it is the one that closes it.
    act(() => {
      container.querySelector(".goal__summary")?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });
    expect(container.querySelector(".goal")?.getAttribute("data-held-open")).toBeNull();
  });

  /**
   * It lies over the right-hand end of the page, so clicking off it is the
   * gesture people reach for — the same one the Action Sheet's shade takes.
   */
  /**
   * The regression the outside-click listener shipped with: a discrete click
   * flushes the effect that registers it while the same click is still on its
   * way to the document, so without the toggle's exclusion the opening click
   * closed the panel again and it never opened at all.
   *
   * **This cannot fail in this runner**, which flushes effects at the end of
   * `act` — after the click has finished travelling. It is here as the statement
   * of the requirement, and the guard that actually holds is the exclusion in
   * the handler; a mutation of that is invisible here, which is how it came to
   * be deleted.
   */
  it("opens from its own control and stays open", async () => {
    await mount();
    click("Goals");
    expect(container.querySelector(".app__goals")).not.toBeNull();
  });

  /**
   * Hub's own way in is a second opener and needs the same exemption. Unlike
   * the header's, this half can fail here: with the panel already open the
   * click reaches the handler for real, and without the exclusion it closes
   * what was just asked for.
   */
  it("opens from Hub's control and is not closed by it", async () => {
    await mount();
    // A pin first: with nothing pinned the glance is a sentence and offers no
    // way in, there being nothing behind it.
    goal(APHRODITE_MELEE);
    act(() => container.querySelector<HTMLElement>(".app__hubtab")?.click());

    click("Open Goals");
    expect(container.querySelector(".app__goals")).not.toBeNull();

    click("Open Goals");
    expect(container.querySelector(".app__goals")).not.toBeNull();
  });

  it("closes on a click outside it, and not on one inside", async () => {
    await mount();
    click("Goals");

    act(() => {
      container.querySelector(".goals h2")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(container.querySelector(".app__goals")).not.toBeNull();

    act(() => {
      document.body.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(container.querySelector(".app__goals")).toBeNull();
  });

  /**
   * The control that opens it is under the panel's own edge, so without the
   * exclusion the same click would close it and reopen it.
   */
  it("still toggles from its own control while open", async () => {
    await mount();
    click("Goals");
    click("Goals");
    expect(container.querySelector(".app__goals")).toBeNull();
  });

  /**
   * The sheet's close control is inside the shade, and by the time this click
   * reaches the document React has already detached that subtree — `closest`
   * still walks it, which is what keeps the panel out of it.
   */
  it("stays open when a dialog over it is dismissed", async () => {
    await mount();
    goal("AllCloseBoon");
    click("Goals (1)");

    // The sheet, opened from the card's own icon.
    act(() => container.querySelector<HTMLElement>(".goal .node__control")?.click());
    expect(container.querySelector(".sheet")).not.toBeNull();

    // The sheet's own close, not the panel's — both say "Close" and the panel's
    // comes first in the document.
    act(() => container.querySelector<HTMLElement>(".sheet__close")?.click());
    expect(container.querySelector(".sheet")).toBeNull();
    expect(container.querySelector(".app__goals")).not.toBeNull();

    // And the shade, which is the other way out of a dialog.
    act(() => container.querySelector<HTMLElement>(".goal .node__control")?.click());
    act(() => container.querySelector<HTMLElement>(".sheet-scrim")?.click());
    expect(container.querySelector(".sheet")).toBeNull();
    expect(container.querySelector(".app__goals")).not.toBeNull();
  });

  it("closes on Escape, unless a dialog is over it", async () => {
    await mount();
    goal("AllCloseBoon");
    click("Goals (1)");

    // A dialog listens on the document too, and Escape belongs to the thing on
    // top — so the panel stays while one is open.
    press("?", { shiftKey: true });
    press("Escape");
    expect(container.querySelector(".app__goals")).not.toBeNull();

    press("Escape");
    expect(container.querySelector(".app__goals")).toBeNull();
  });

  it("says nothing there while one goal is pinned", async () => {
    await mount();
    goal("AllCloseBoon");
    click("Goals (1)");

    // A single goal's prerequisites are what its own card says, in more detail.
    expect(container.querySelector(".goals__best")).toBeNull();
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

    click("Expand");
    expect(heldInLoadout("AllCloseBoon")).toBe(true);

    click("Collapse");
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
    editRarity("Epic");
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
    // A god's page, because the app opens on Hub now and Hub draws no node.
    node(APHRODITE_MELEE);

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
    expect(card?.querySelector(".loadout__card .boonrow__title")?.textContent).toBe(
      H2[APHRODITE_MELEE]?.name,
    );
    // Beside, not over: the grid it was picked from is still on the page.
    expect(container.querySelectorAll(".loadout__tile")).not.toHaveLength(0);
    expect(container.querySelector(".sheet-scrim")).toBeNull();

    // By class rather than by its glyph: a God Tab's remove control is an × too,
    // and it comes first in the document. Their accessible names differ, which
    // is the half that matters to a reader.
    act(() => container.querySelector<HTMLElement>(".loadout__cardclose")?.click());
    expect(container.querySelector(".loadout__card")).toBeNull();
  });

  /** A card describing a boon nobody holds is a card about nothing. */
  it("closes the card when the boon leaves the run", async () => {
    await mount();
    tap(APHRODITE_MELEE);
    tap(APHRODITE_MELEE);
    expect(container.querySelector(".loadout__card")).not.toBeNull();

    click("Remove");
    click("Remove boon and god from pool");
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

    // Rendered by hand rather than through `mount`, so it needs the game route
    // for the same reason: the bare URL is the site's front page.
    window.location.hash = GAME_HASH.hades2;
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
    return { ...memory, save: () => Promise.reject(new Error("quota exceeded")) };
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

    expect(texts(".notice__title")).toContain(STORAGE_ERROR_TITLE);
    // The edit was still accepted: the screen is right, only the reload is at
    // risk.
    expect(heldInLoadout(APHRODITE_MELEE)).toBe(true);
  });

  it("says so up front when the browser has no storage at all", async () => {
    await mount(createMemoryStore(), false);
    expect(texts(".notice__title")).toContain("This browser won't let the Handbook save.");
  });
});

describe("starting a run in another slot", () => {
  it("leaves the old run in its slot and opens the fresh one", async () => {
    const store = createMemoryStore();
    await mount(store);
    tap(APHRODITE_MELEE);

    await startNewRun();

    expect(container.querySelector(".loadout__empty")).not.toBeNull();
    // Nothing was filed over anything: the run is still in the slot it was in.
    expect(await store.load("hades2", 1)).not.toBeNull();
    expect(await store.openSlot("hades2")).toBe(2);

    // And the fresh run is the one a reload finds.
    const source = await openManualSource({ game: "hades2", store });
    expect(source.getFacts().held.size).toBe(0);
  });
});

/**
 * The Run Overview, and the whole of what this row proved: the second record
 * was written by `finishRun` for two tiers and opened by nothing. What is drawn
 * here is read back out of that record rather than kept from the run that was
 * in memory a moment ago.
 */
describe("the run overview", () => {
  const overview = () => container.querySelector(".overview");

  /**
   * The header's control opens the run already in play. There is no *finished*
   * run in the model — only the run in whichever slot is open — so this is the
   * same view the door opens on the filed one, saying the same things.
   */
  it("opens on the run in play", async () => {
    await mount();
    tap(APHRODITE_MELEE);

    click("Overview");

    expect(overview()).not.toBeNull();
    expect(texts(".overview__stat dd")[0]).toBe("1");
    expect(texts(".overview__tilename")).toContain(H2[APHRODITE_MELEE]?.name ?? "");
    // Grouped under the god who gave it, which is what a results screen is.
    expect(texts(".overview__groupname")).toEqual(["Aphrodite"]);
  });

  /* This view is what an image export carries off the site, which is what
     makes the disclaimer part of the picture rather than furniture around it. */
  it("carries the unaffiliated line", async () => {
    await mount();
    tap(APHRODITE_MELEE);
    click("Overview");

    expect(container.querySelector(".overview__unaffiliated")?.textContent).toContain(
      "unofficial",
    );
  });

  /** The first of its two buttons, and the one Escape means. */
  it("returns to the run it was opened from", async () => {
    await mount();
    tap(APHRODITE_MELEE);
    click("Overview");

    click("Resume this run");

    expect(overview()).toBeNull();
    expect(heldInLoadout(APHRODITE_MELEE)).toBe(true);
    expect(container.querySelector(".app__godbar")).not.toBeNull();
  });

  /**
   * The way out hands over rather than acting: the door is where you choose,
   * and one of its slots is *Continue run*, so pressing this and changing your
   * mind costs nothing. There is no *start a new run* here — it only ever put
   * this same screen up, so two buttons carried one behaviour.
   */
  it("hands over to the door rather than acting on the run", async () => {
    const store = createMemoryStore();
    await mount(store);
    tap(APHRODITE_MELEE);
    click("Overview");

    expect(control("Start new run", true)).toBeNull();
    await act(async () => {
      control("Back to save slots").click();
    });

    expect(overview()).toBeNull();
    expect(container.querySelector(".saves")).not.toBeNull();
    // The run is where it was and still the one being played.
    expect(await store.openSlot("hades2")).toBe(1);
    await takeSlot("Continue run");
    expect(heldInLoadout(APHRODITE_MELEE)).toBe(true);
  });

  /**
   * The way back that survives a reload, and the one entrance that shows a run
   * other than the one in play.
   */
  it("is reachable from a saved slot on the save screen", async () => {
    const store = createMemoryStore();
    await mount(store);
    toTheDoor();
    expect(slotLabels()).toEqual([
      "( Empty Save Slot )",
      "( Empty Save Slot )",
      "( Empty Save Slot )",
    ]);
    await takeSlot("Start a new run");

    tap(APHRODITE_MELEE);
    await startNewRun();

    await follow("#/");
    await follow(GAME_HASH.hades2);
    // A slot of its own, which is how a save screen offers anything.
    expect(slotLabels()).toEqual([
      "Saved run",
      "( Empty Save Slot )",
      "( Empty Save Slot )",
    ]);

    await takeSlot("Saved run");
    // Instead of the door rather than over it.
    expect(overview()).not.toBeNull();
    expect(container.querySelector(".saves")).toBeNull();
    expect(texts(".overview__tilename")).toContain(H2[APHRODITE_MELEE]?.name ?? "");
  });

  /**
   * Going into the run being looked at, which for a saved one means opening its
   * slot. One label, because the model has one kind of run.
   */
  it("goes into a saved run when that is the one it is showing", async () => {
    const store = createMemoryStore();
    await mount(store);
    tap(APHRODITE_MELEE);
    await startNewRun();

    await follow("#/");
    await follow(GAME_HASH.hades2);
    await takeSlot("Saved run");
    await act(async () => {
      control("Resume this run").click();
    });

    expect(overview()).toBeNull();
    expect(container.querySelector(".saves")).toBeNull();
    expect(heldInLoadout(APHRODITE_MELEE)).toBe(true);
    // It is the slot that is open now, and it is still the only copy.
    expect(await store.openSlot("hades2")).toBe(1);
  });

  /**
   * The withholding is gone with the reason for it. Adopting a run used to
   * overwrite the one in play, because there was one active slot; the run being
   * left now stays in its own slot, so nothing has to be refused.
   */
  it("offers the resume even while another run is still in play", async () => {
    const store = createMemoryStore();
    await mount(store);
    tap(APHRODITE_MELEE);
    await startNewRun();
    // A run in play again, in the slot beside the saved one.
    tap(ARES_MELEE);

    toTheDoor();
    await takeSlot("Saved run");

    expect(overview()).not.toBeNull();
    await act(async () => {
      control("Resume this run").click();
    });

    expect(heldInLoadout(APHRODITE_MELEE)).toBe(true);
    // And the run that was in play is still in the slot it was in.
    expect((await store.load("hades2", 2))?.facts.held).toHaveLength(1);
    expect(texts(".notice__title")).toEqual([]);
  });

  /**
   * The one gesture that destroys a run somebody kept, and the caller `clearRun`
   * spent a tier without. Asked twice rather than confirmed in a dialog: the run
   * is on the screen above the control.
   */
  it("drops a saved run when it is asked twice, and not once", async () => {
    const store = createMemoryStore();
    await mount(store);
    tap(APHRODITE_MELEE);
    await startNewRun();

    toTheDoor();
    await takeSlot("Saved run");
    await act(async () => {
      control("Delete this run").click();
    });
    expect(await store.load("hades2", 1)).not.toBeNull();

    await act(async () => {
      control("Delete this run permanently").click();
    });

    expect(container.querySelector(".saves")).not.toBeNull();
    expect(await store.load("hades2", 1)).toBeNull();
    expect(slotLabels()[0]).toBe("( Empty Save Slot )");
    // The run in play is untouched, which is what makes deleting one safe.
    expect(await store.openSlot("hades2")).toBe(2);
  });

  /** Survives the tab closing, which is the only reason it is a record. */
  it("is still there after a reload", async () => {
    const store = createMemoryStore();
    await mount(store);
    tap(APHRODITE_MELEE);
    await startNewRun();

    act(() => root.unmount());
    container.remove();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await mount(store);

    await follow("#/");
    await follow(GAME_HASH.hades2);
    await takeSlot("Saved run");
    expect(texts(".overview__tilename")).toContain(H2[APHRODITE_MELEE]?.name ?? "");
  });

  /**
   * Starting a new run leaves the old one in its slot, and the door has to
   * follow: without the re-read it goes on offering the slots as they stood
   * before, until a reload.
   */
  it("follows the run the save screen left behind", async () => {
    await mount();
    tap(APHRODITE_MELEE);

    await follow("#/");
    await follow(GAME_HASH.hades2);
    await takeSlot("Start a new run");

    await follow("#/");
    await follow(GAME_HASH.hades2);
    await takeSlot("Saved run");
    expect(texts(".overview__tilename")).toContain(H2[APHRODITE_MELEE]?.name ?? "");
  });

  /**
   * A record this build cannot read costs its own slot and nothing else — the
   * three beside it are not damaged, and the player is told which one is.
   */
  it("reports a saved run it cannot decode in that slot alone", async () => {
    const store = createMemoryStore();
    await store.save("hades2", 3, {
      storeVersion: STORE_VERSION + 9,
      facts: {},
      intent: {},
    } as never);
    await mount(store);
    toTheDoor();

    expect(slotLabels()).toEqual([
      "( Empty Save Slot )",
      "( Empty Save Slot )",
      "Damaged save",
    ]);
    expect(texts(".notice__title")).toEqual([]);
  });
});

/**
 * The run boundary, which is the save screen: the header carries a way *there*
 * and nothing that acts on a run. Starting a run takes a free slot and the run
 * you were in stays where it is, so a run goes only where every slot is taken
 * and the player names the one to drop.
 */
describe("starting a new run", () => {
  /**
   * The header's run cluster, which is three controls and no more: Goals, the
   * Overview, and the door. Nothing in it ends a run.
   */
  it("offers a way to the door and nothing that acts on the run", async () => {
    await mount();

    expect(container.querySelector(".app__door")).not.toBeNull();
    expect(control("End run", true)).toBeNull();
    expect(control("Start new run", true)).toBeNull();
    // Named for a reader who gets no picture.
    expect(container.querySelector(".app__door")?.textContent).toContain("Save slots");
  });

  /**
   * It files nothing on the way. The door is where a player chooses, and one of
   * its slots is *Continue run* — so the boundary cannot end a run somebody did
   * not mean to end.
   */
  it("puts the door up without touching the run", async () => {
    const store = createMemoryStore();
    await mount(store);
    tap(APHRODITE_MELEE);

    toTheDoor();

    expect(container.querySelector(".saves")).not.toBeNull();
    expect(slotLabels()[0]).toBe("Continue run");
    await takeSlot("Continue run");
    expect(heldInLoadout(APHRODITE_MELEE)).toBe(true);
  });

  /**
   * The door closes when the run is really there, not when the press happens.
   * Closed first, a tap made while the write was in flight would be wiped by
   * the fresh run arriving behind it — which is what the harness found.
   */
  it("keeps the door up until the new run has been stored", async () => {
    const memory = createMemoryStore();
    let gate: Promise<void> | null = null;
    let open: (() => void) | null = null;
    const store: RunStore = {
      ...memory,
      save: async (game, slot, run) => {
        if (gate !== null) await gate;
        return memory.save(game, slot, run);
      },
    };
    await mount(store);
    tap(APHRODITE_MELEE);
    toTheDoor();

    gate = new Promise<void>((resolve) => {
      open = resolve;
    });
    await takeSlot("Start a new run");
    expect(container.querySelector(".saves")).not.toBeNull();

    gate = null;
    await act(async () => {
      open?.();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(container.querySelector(".saves")).toBeNull();
  });

  it("takes the first free slot, and the row says only what it is", async () => {
    const store = createMemoryStore();
    await mount(store);
    tap(APHRODITE_MELEE);
    toTheDoor();

    // The label and nothing else, the user's call: which slot it takes is not a
    // choice, so saying which reads as one.
    const first = container.querySelectorAll(".saves__slot")[0];
    expect(first?.querySelector(".saves__note")).toBeNull();
    await takeSlot("Start a new run");

    expect(container.querySelector(".loadout__empty")).not.toBeNull();
    expect(await store.openSlot("hades2")).toBe(2);
  });

  /**
   * What the old empty-run guard became. It was a refusal inside the verb,
   * defending one filed record; per slot it is a question about what a slot is,
   * so a run holding nothing never takes one and the door can be walked as many
   * times as you like.
   */
  it("reuses the slot it is in where that run holds nothing", async () => {
    const store = createMemoryStore();
    await mount(store);

    await startNewRun();
    await startNewRun();
    await startNewRun();
    toTheDoor();

    expect(slotLabels()).toEqual([
      "( Empty Save Slot )",
      "( Empty Save Slot )",
      "( Empty Save Slot )",
    ]);
    expect(await store.openSlot("hades2")).toBe(1);
  });

  /**
   * The defect the slots absorbed: the boundary used to be skipped entirely on
   * a run holding only an equipped weapon, so *Start a new run* handed the
   * player back the weapon they were leaving behind.
   */
  it("gives a fresh run to a player whose old one carried only a weapon", async () => {
    await mount();
    click("Witch's Staff");

    await startNewRun();

    expect(container.querySelector(".loadout__weaponname")?.textContent ?? "").not.toContain(
      "Witch's Staff",
    );
  });

  /**
   * A run is lost only where the player fills the last slot and names the one
   * to drop, which is two deliberate presses rather than a confirmation nobody
   * reads.
   */
  it("asks which run to replace once every slot is taken", async () => {
    const store = createMemoryStore();
    await mount(store);
    tap(APHRODITE_MELEE);
    await startNewRun();
    tap(APHRODITE_MELEE);
    await startNewRun();
    tap(APHRODITE_MELEE);
    toTheDoor();

    await takeSlot("Start a new run");

    // Armed, and nothing dropped yet: the screen says what it is asking by
    // changing state, which is the only warning there is.
    expect(container.querySelector(".saves__title")?.textContent).toBe("Choose a run to replace");
    expect(slotLabels().every((label) => label === "Replace this run")).toBe(true);
    expect((await store.load("hades2", 1))?.facts.held).toHaveLength(1);

    await takeSlot("Replace this run", 1);

    expect(container.querySelector(".saves")).toBeNull();
    expect(container.querySelector(".loadout__empty")).not.toBeNull();
    expect(await store.openSlot("hades2")).toBe(2);
    // The two the player did not name are untouched.
    expect((await store.load("hades2", 1))?.facts.held).toHaveLength(1);
    expect((await store.load("hades2", 3))?.facts.held).toHaveLength(1);
  });

  it("lets the player back out of the question without dropping anything", async () => {
    const store = createMemoryStore();
    await mount(store);
    for (const _ of [1, 2]) {
      tap(APHRODITE_MELEE);
      await startNewRun();
    }
    tap(APHRODITE_MELEE);
    toTheDoor();
    await takeSlot("Start a new run");

    await takeSlot("Never mind");

    expect(container.querySelector(".saves__title")?.textContent).toBe(
      "Choose a save slot to begin",
    );
    expect((await store.load("hades2", 1))?.facts.held).toHaveLength(1);
  });
});

describe("a write that throws", () => {
  /**
   * Starting a run is the one boundary a tap can reach, and it writes before it
   * clears anything. An exception out of a tap handler unmounts the tree, and a
   * blank screen is a worse answer than a wrong one — so the page has to
   * survive it with the run intact.
   */
  it("keeps the page and the run when the new run cannot be stored", async () => {
    const memory = createMemoryStore();
    const store: RunStore = {
      ...memory,
      save: () => Promise.reject(new Error("quota exceeded")),
    };
    await mount(store);
    tap(APHRODITE_MELEE);

    await startNewRun();

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
    // A Legendary takes a band under every layer rather than the layer its
    // prerequisites put it in, so it names itself here too.
    expect(texts(".godpage h3")).toEqual(["Legendaries", "Infusions"]);
    showRim();
    expect(texts(".godpage h3")).toEqual([
      "Legendaries",
      "Infusions",
      "Duos and Godsent Hexes",
    ]);

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
    const shown = () => texts(".app__gods button:not(.app__weapontab)");
    expect(shown()).not.toContain("Ares");

    // Added for planning, without having met them. The tab that was showing
    // before is the Hub, which is always there — a run that has met nobody
    // carries no god at all now that the Hub holds the bar open.
    expect(shown()).toEqual(["Hub", "+Add a god"]);
    showGod("Ares");
    expect(shown()).toContain("Ares");
    expect(shown()).not.toContain("Aphrodite");

    tap(APHRODITE_MELEE);
    expect(
      container.querySelector<HTMLElement>('.app__gods button[data-pooled="true"]')?.textContent,
    ).toBe("Aphrodite");

    // Correcting the mis-tap takes Aphrodite back out of the pool; the tab
    // stays, because it is the player's and not the pool's.
    tap(APHRODITE_MELEE);
    click("Remove");
    click("Remove boon and god from pool");
    expect(shown()).toContain("Aphrodite");
    expect(container.querySelector('.app__gods button[data-pooled="true"]')).toBeNull();
  });

  /**
   * The card's second removal names the pool, so it does what it says whatever
   * the run did earlier. Reported: a god who had been purged once could never be
   * taken back out — the guard that keeps a god whose reward really was taken is
   * an inference, and this control is an instruction.
   */
  it("takes a god out of the pool even where an earlier boon of theirs was purged", async () => {
    await mount();
    showGod("Aphrodite");

    // A real reward, taken and then lost: the pool keeps her, and should.
    tap(APHRODITE_MELEE);
    tap(APHRODITE_MELEE);
    click("Remove");
    click("Remove boon only");
    expect(
      container.querySelector<HTMLElement>('.app__gods button[data-pooled="true"]')?.textContent,
    ).toBe("Aphrodite");

    // A second boon, and the player says outright that she is not in the pool.
    tap("AphroditeSpecialBoon");
    tap("AphroditeSpecialBoon");
    click("Remove");
    click("Remove boon and god from pool");
    expect(container.querySelector('.app__gods button[data-pooled="true"]')).toBeNull();
  });

  /**
   * The symbol and nothing drawn beside it. Three of the Hades II gods borrow
   * the other game's file — measured, Artemis, Athena and Dionysus reach a tab
   * here and have no symbol of their own.
   */
  it("draws a tab as its god's symbol, with the name in text a reader gets", async () => {
    await mount();
    showGod("Artemis");

    const tab = [...container.querySelectorAll<HTMLElement>(".app__godtab")].find(
      (button) => button.textContent?.trim() === "Artemis",
    );
    expect(tab).toBeDefined();
    expect(tab?.querySelector<HTMLImageElement>(".app__godart")?.getAttribute("src")).toBe(
      "/art/official/hades1/BoonSymbolArtemis.webp",
    );

    // Nothing about which god this is depends on the picture arriving: the name
    // is the control's accessible name and its tooltip, just not drawn.
    expect(tab?.querySelector(".visually-hidden")?.textContent).toBe("Artemis");
    expect(tab?.getAttribute("title")).toBe("Artemis");
  });

  /** A god this game draws keeps its own art, the two sets being framed alike. */
  it("keeps a Hades II god on the Hades II set", async () => {
    await mount();
    showGod("Hera");

    const tab = [...container.querySelectorAll<HTMLElement>(".app__godtab")].find(
      (button) => button.textContent?.trim() === "Hera",
    );
    expect(tab?.querySelector<HTMLImageElement>(".app__godart")?.getAttribute("src")).toBe(
      "/art/official/hades2/BoonSymbolHera.webp",
    );
  });

  /**
   * The sticky rule has always read *"until the user removes it"* and nothing
   * could. The pool half of the bar is derived, so a removal has to be recorded
   * rather than inferred from an absence — otherwise a god still in the pool
   * puts their own tab straight back.
   */
  it("takes a tab down when asked and offers the god again", async () => {
    await mount();
    tap(APHRODITE_MELEE);
    // A second tab, or there is nothing to fall back to and the bar refuses to
    // empty — which is the rule below.
    showGod("Ares");
    expect(texts(".app__godtab")).toContain("Aphrodite");

    const drop = [...container.querySelectorAll<HTMLElement>(".app__goddrop")].find(
      (button) => button.getAttribute("aria-label") === "Remove the Aphrodite tab",
    );
    expect(drop).toBeDefined();
    act(() => drop?.click());

    // Gone from the bar even though the run still holds one of her boons — the
    // removal is the player's and outranks the pool, which is the whole reason
    // it has to be recorded rather than inferred from an absence.
    expect(texts(".app__godtab")).not.toContain("Aphrodite");
    expect(heldInLoadout(APHRODITE_MELEE)).toBe(true);

    const picker = container.querySelector<HTMLElement>(".godpicker");
    act(() => picker?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true })));
    expect(texts(".godpicker__god")).toContain("Aphrodite");
  });

  /**
   * Every god tab can come down now, because the Hub is what holds the bar open
   * — it used to be the first god, who could not be removed and was swapped for
   * somebody else the moment a run met anyone.
   */
  it("lets every god tab come down, leaving the Hub", async () => {
    await mount();
    showGod("Ares");
    showGod("Athena");

    for (const drop of [...container.querySelectorAll<HTMLElement>(".app__goddrop")]) {
      act(() => drop.click());
    }
    expect(texts(GOD_TABS).map((t) => t.trim())).toEqual(["Hub"]);
    expect(container.querySelector(".app__goddrop")).toBeNull();
  });

  /**
   * The bar is the player's, and each game has its own. `Run` is keyed on the
   * game, so a switch remounts it and used to take the curated set with it —
   * and a set shared between the games would have put a tab asked for while
   * reading one game onto the other's bar, eleven gods appearing in both.
   */
  it("keeps each game's curated bar, and keeps them apart", async () => {
    await mount();
    showGod("Athena");
    expect(texts(".app__godtab")).toContain("Athena");

    // Awaited, because a switch reopens the run against the other catalog and
    // the page shows its loading state until that settles.
    await follow(GAME_HASH.hades1);
    expect(texts(".app__godtab")).not.toContain("Athena");
    showGod("Ares");

    await follow(GAME_HASH.hades2);
    expect(texts(".app__godtab")).toContain("Athena");
    // Ares is a god of both games and was asked for in only one of them.
    expect(texts(".app__godtab")).not.toContain("Ares");
  });

  /**
   * The order gods arrived, not the alphabet. Ares is met first here and sorts
   * after Aphrodite, so the two orders disagree and only one of them can be
   * what the bar shows.
   */
  it("puts a newly met god at the right-hand end of the bar", async () => {
    await mount();
    tap(ARES_MELEE);
    tap(APHRODITE_MELEE);

    expect(texts(".app__godslot .app__godtab").map((t) => t.trim())).toEqual([
      "Ares",
      "Aphrodite",
    ]);
  });

  /**
   * A god added by hand goes on the end too, and a god met *after* that goes
   * after them — which is the case a bar ordered by "pool first, then added"
   * gets wrong, and the reason the arrangement is recorded rather than derived.
   */
  it("keeps a hand-added god ahead of a god met after them", async () => {
    await mount();
    tap(ARES_MELEE);
    showGod("Hera");
    tap(APHRODITE_MELEE);

    expect(texts(".app__godslot .app__godtab").map((t) => t.trim())).toEqual([
      "Ares",
      "Hera",
      "Aphrodite",
    ]);
  });

  /** Taken down and asked for again is arriving again, so it goes on the end. */
  it("puts a god taken down and re-added back at the end rather than in their old place", async () => {
    await mount();
    tap(ARES_MELEE);
    showGod("Hera");
    showGod("Zeus");

    const drop = [...container.querySelectorAll<HTMLElement>(".app__godslot")]
      .find((slot) => slot.textContent?.includes("Hera"))
      ?.querySelector<HTMLElement>(".app__goddrop");
    act(() => drop?.click());
    showGod("Hera");

    expect(texts(".app__godslot .app__godtab").map((t) => t.trim())).toEqual([
      "Ares",
      "Zeus",
      "Hera",
    ]);
  });

  it("puts every god up at once when asked", async () => {
    await mount();
    const picker = container.querySelector<HTMLElement>(".godpicker");
    act(() => picker?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true })));
    act(() => container.querySelector<HTMLElement>(".godpicker__all")?.click());

    // Every god this game attributes a boon to, and the picker has nothing
    // left. Counted inside the slots the gods are drawn in, which is also an
    // assertion that Hub is not one of them — it carries no removal.
    expect(container.querySelectorAll(".app__godslot .app__godtab").length).toBe(14);
    expect(container.querySelector(".godpicker")).toBeNull();
  });

  /**
   * Two controls for the one job, because a hover-opened list is unreachable on
   * a touch screen and a system picker over a list of pictures is the wrong
   * control on a laptop. The stylesheet shows whichever the device can work, so
   * both are here and exactly one of them is ever in the tab order.
   */
  it("offers the unshown gods through a hovered list and through the platform's picker", async () => {
    await mount();
    expect(container.querySelector(".app__addgod select")).not.toBeNull();

    const picker = container.querySelector<HTMLElement>(".godpicker");
    expect(picker).not.toBeNull();
    act(() => picker?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true })));

    const ares = [...container.querySelectorAll<HTMLElement>(".godpicker__god")].find(
      (button) => button.textContent === "Ares",
    );
    expect(ares).toBeDefined();
    act(() => ares?.click());

    // Added to the bar and selected, which is what picking one means.
    expect(texts(".app__gods button")).toContain("Ares");
    expect(container.querySelector(".app__gods button[aria-current]")?.textContent).toBe("Ares");
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

    /* Remove asks nothing while the god has another boon held, and leaves them
       in the pool: a god you have met is one you have met. It is only on the
       last one that the two removals differ, and only there that it asks. */
    tapOnPage(APHRODITE_MELEE);
    expect(texts(".sheet__removals button").map((t) => t.trim())).toEqual(["Remove"]);
    click("Remove");
    expect(container.querySelector('.app__gods button[data-pooled="true"]')).not.toBeNull();

    tapOnPage("AphroditeSpecialBoon");
    click("Remove");
    expect(texts(".sheet__removals button").map((t) => t.trim())).toEqual([
      "Remove boon only",
      "Remove boon and god from pool",
    ]);
    click("Remove boon only");
    expect(container.querySelector('.app__gods button[data-pooled="true"]')).not.toBeNull();

    // And the half that says so outright takes the god with it.
    tap(APHRODITE_MELEE);
    tapOnPage(APHRODITE_MELEE);
    click("Remove");
    click("Remove boon and god from pool");
    expect(container.querySelector('.app__gods button[data-pooled="true"]')).toBeNull();
  });
});

/**
 * The two commands that act on the page rather than on whatever has focus, and
 * the list that is the only place any of them is written down.
 */
describe("the page-wide keys", () => {
  const current = () =>
    container.querySelector('.app__godtab[aria-current="page"]')?.textContent?.trim() ?? null;

  /**
   * The whole bar, weapon tabs included: they are tabs, so stepping walks onto
   * them the way it walks onto the Hub. Driven to each end rather than counting
   * presses, since the bar's length is the run's business and not this test's.
   */
  it("steps the whole bar on the brackets, clamped at both ends", async () => {
    await mount();
    showGod("Athena");
    showGod("Ares");
    const bar = texts(".app__godtab").map((t) => t.trim());
    expect(bar.length).toBeGreaterThan(1);

    press("[");
    expect(current()).toBe(bar[bar.indexOf("Ares") - 1]);
    press("]");
    expect(current()).toBe("Ares");

    // Clamped at the far end: pressing past the last tab is not a way round to
    // the first. One press more than there are tabs, so arriving is certain.
    for (let step = 0; step <= bar.length; step += 1) press("]");
    expect(current()).toBe(bar[bar.length - 1]);
    for (let step = 0; step <= bar.length; step += 1) press("[");
    expect(current()).toBe(bar[0]);
  });

  it("opens the shortcut list on its key and closes it on Escape", async () => {
    await mount();
    expect(container.querySelector(".shortcuts")).toBeNull();

    press("k");
    expect(container.querySelector(".shortcuts")).not.toBeNull();
    expect(container.textContent).toContain("Set or clear a goal");

    press("Escape");
    expect(container.querySelector(".shortcuts")).toBeNull();
  });

  /**
   * Two dialogs, one step apart: Help is how to use the thing and is on every
   * page, and the shortcut list is every binding written out and is a step past
   * it. `?` used to open the second, which is why this pins both.
   */
  it("keeps help and the shortcut list on separate keys", async () => {
    await mount();

    press("?", { shiftKey: true });
    expect(container.querySelector(".help")).not.toBeNull();
    expect(container.querySelector(".shortcuts")).toBeNull();
    press("Escape");

    press("h");
    expect(container.querySelector(".help")).not.toBeNull();
    press("Escape");

    press("k");
    expect(container.querySelector(".shortcuts")).not.toBeNull();
    expect(container.querySelector(".help")).toBeNull();
  });

  it("puts help behind a control and the shortcut list behind none", async () => {
    await mount();
    expect(texts("button").some((label) => /shortcut/i.test(label))).toBe(false);

    const help = container.querySelector<HTMLElement>(".app__help");
    expect(help?.getAttribute("aria-label")).toBe("How to use this Handbook");
    act(() => help?.click());
    expect(container.querySelector(".help")).not.toBeNull();
  });

  /**
   * These listen on the document, so they hear every press in the app. The one
   * field on the page today is the god picker's select, and a bracket typed into
   * a search box tomorrow must not change the god.
   */
  it("leaves a press inside a field to the field", async () => {
    await mount();
    // A second tab first, or there is nowhere for the key to step and the test
    // passes whether the guard is there or not. That is the shape to be
    // suspicious of, and this one was written that way before it was checked.
    showGod("Athena");
    const before = current();
    expect(texts(".app__godtab").length).toBeGreaterThan(1);

    // Backwards, because the tab just selected is the last one and forwards
    // clamps to where it already is — which is the same test passing for the
    // wrong reason one step further along.
    const field = container.querySelector<HTMLElement>(".app__addgod select");
    expect(field).not.toBeNull();
    act(() => {
      field?.dispatchEvent(new KeyboardEvent("keydown", { key: "[", bubbles: true }));
    });
    expect(current()).toBe(before);
  });

  /**
   * Whether a god is in the run's pool is a fact about the run drawn as a glow,
   * and a glow is the one channel a reader gets nothing of.
   */
  it("says which gods are in the pool, not only glows them", async () => {
    await mount();
    tap(APHRODITE_MELEE);
    // A tab that is only there for planning, so the assertion below has both
    // halves to tell apart rather than one.
    showGod("Athena");

    const tab = [...container.querySelectorAll<HTMLElement>(".app__godtab")].find(
      (button) => button.dataset["pooled"] === "true",
    );
    expect(tab?.getAttribute("aria-label")).toBe("Aphrodite — in your pool");
    // And a tab that is only there for planning says nothing extra, or the
    // distinction the glow draws would be lost the other way round.
    const planning = [...container.querySelectorAll<HTMLElement>(".app__godtab")].find(
      (button) => button.dataset["pooled"] === "false",
    );
    expect(planning?.getAttribute("aria-label")).toBeNull();
  });

  /**
   * Enter marks an un-held boon rather than opening its sheet, so reading what
   * one still needs before taking it had no gesture at all.
   */
  it("opens an un-held boon's requirements without marking it", async () => {
    await mount();
    const boon = node("AllCloseBoon");
    act(() => boon.focus());
    act(() => {
      boon.dispatchEvent(new KeyboardEvent("keydown", { key: "b", bubbles: true }));
    });

    expect(container.querySelector(".sheet")).not.toBeNull();
    expect(texts(".sheet__needed h3")).toEqual(["Still needed"]);
    // Reading is not taking: the run is untouched.
    expect(heldInLoadout("AllCloseBoon")).toBe(false);
  });

  it("sets a goal from the keyboard, which is the gesture a pointer had alone", async () => {
    await mount();
    const boon = node(APHRODITE_MELEE);
    act(() => boon.focus());
    act(() => {
      boon.dispatchEvent(new KeyboardEvent("keydown", { key: "g", bubbles: true }));
    });

    // The Goals control carries the count, so the pin is visible without opening
    // the panel — and a pin is the one thing no keyboard could make before.
    expect(control("Goals (1)")).toBeDefined();
  });
});

/**
 * Hub, which is a tab on the bar and deliberately not a god: the bar's
 * selection is a sum, so nothing here can put a pseudo-god id in front of the
 * icon resolver, the picker's list or a pool question.
 */
describe("the Hub tab", () => {
  const bar = () => texts(".app__godtab").map((text) => text.trim());
  const current = () =>
    container.querySelector('.app__godtab[aria-current="page"]')?.textContent?.trim() ?? null;

  it("opens on Hub and pins it in front of the gods", async () => {
    await mount();

    expect(bar()[0]).toBe("Hub");
    expect(current()).toBe("Hub");
    // No graph on the Hub, so nothing on it can be mistaken for a god's page.
    expect(container.querySelector(".godpage")).toBeNull();
  });

  /** Removal is about the tabs a player put up, so this one carries none. */
  it("offers no way to take it down", async () => {
    await mount();
    const hub = container.querySelector(".app__hubtab");

    expect(hub?.closest(".app__godslot")).toBeNull();
    for (const drop of [...container.querySelectorAll<HTMLElement>(".app__goddrop")]) {
      act(() => drop.click());
    }
    expect(bar()).toContain("Hub");
  });

  it("is where a god's page goes when its own tab comes down", async () => {
    await mount();
    showGod("Athena");
    expect(current()).toBe("Athena");

    const drop = [...container.querySelectorAll<HTMLElement>(".app__goddrop")].find(
      (button) => button.getAttribute("aria-label") === "Remove the Athena tab",
    );
    act(() => drop?.click());
    expect(current()).toBe("Hub");
  });

  /** It is a tab, so the brackets reach it rather than stopping at the first god. */
  it("is one step back from the first god", async () => {
    await mount();
    showGod("Athena");
    press("[");
    press("[");
    press("[");
    expect(current()).toBe("Hub");

    press("]");
    expect(current()).toBe(bar()[1]);
  });

  /**
   * The resume line reads the run rather than a copy of it, which is the whole
   * of why it is here: a stored run reopens on Hub and says what it holds.
   */
  it("counts the real run and hands back the gods it met", async () => {
    await mount();
    tap(APHRODITE_MELEE);
    act(() => container.querySelector<HTMLElement>(".app__hubtab")?.click());

    expect(container.querySelector(".hub__resume")?.textContent).toBe("1 boon from 1 god.");
    expect(texts(".hub__god").map((text) => text.trim())).toEqual(["Aphrodite"]);

    act(() => container.querySelector<HTMLElement>(".hub__god")?.click());
    expect(current()).toBe("Aphrodite");
  });

  it("goes to a god when one is picked, and comes back when Hub is", async () => {
    await mount();
    showGod("Athena");
    expect(container.querySelector(".godpage")).not.toBeNull();

    act(() => container.querySelector<HTMLElement>(".app__hubtab")?.click());
    expect(container.querySelector(".godpage")).toBeNull();
    expect(container.querySelector(".hub")).not.toBeNull();
  });
});

/**
 * The site's front page and the routes under it. A hash rather than a path,
 * because the product is meant to be published on a static host with nothing
 * configured, and a path route 404s there on a cold load.
 */
describe("the site's pages", () => {
  it("opens on Home, which runs no game", async () => {
    await act(async () => {
      root.render(<App store={createMemoryStore()} presence={null} persistent />);
    });

    expect(container.querySelector(".home")).not.toBeNull();
    // The god bar, which is the thing a game view has and this page does not —
    // both wear the same header, so `.app` is on the page either way.
    expect(container.querySelector(".app__gods")).toBeNull();
    // The one thing this page has to carry while its overview is still to be
    // written.
    expect(container.querySelector(".home__disclaimer")?.textContent).toContain(
      "Supergiant Games",
    );
  });

  it("offers a door per game, neither of them the default", async () => {
    await act(async () => {
      root.render(<App store={createMemoryStore()} presence={null} persistent />);
    });

    const doors = [...container.querySelectorAll<HTMLAnchorElement>(".home__game")];
    expect(doors.map((a) => a.getAttribute("href"))).toEqual([
      GAME_HASH.hades1,
      GAME_HASH.hades2,
    ]);
    expect(doors.map((a) => a.textContent?.trim())).toEqual(["IHades", "IIHades II"]);
  });

  it("goes into a game on its hash and comes back on the bare one", async () => {
    await mount();
    expect(container.querySelector(".app__gods")).not.toBeNull();

    await follow("#/");
    expect(container.querySelector(".home")).not.toBeNull();
    expect(container.querySelector(".app__gods")).toBeNull();
  });

  it("is what the product's own name leads to from inside a game", async () => {
    await mount();
    const name = container.querySelector<HTMLAnchorElement>(".app__name");
    expect(name?.textContent).toBe("Hades Handbook");
    expect(name?.getAttribute("href")).toBe("#/");
  });

  it("gives getting started a page of its own", async () => {
    await act(async () => {
      root.render(<App store={createMemoryStore()} presence={null} persistent />);
    });
    const started = container.querySelector<HTMLAnchorElement>(".home__started");
    expect(started?.textContent?.trim()).toBe("Getting started");

    await follow(started?.getAttribute("href") ?? "");
    expect(container.querySelector(".home h1")?.textContent).toBe("Getting started");
  });
});

/**
 * The header every page wears. What changes between them is its two ends: the
 * marks and the run-wide controls belong to a game, and the way in belongs to a
 * page that is not one.
 */
describe("the site header", () => {
  const marks = () =>
    [...container.querySelectorAll<HTMLElement>(".app__mark")].map((el) => ({
      game: el.dataset["game"],
      current: el.dataset["current"] === "true",
      label: el.getAttribute("aria-label"),
      href: el.getAttribute("href"),
    }));

  it("draws a mark per game, with the one being read marked as current", async () => {
    await mount();

    // The game being read comes first, so the mark that says "you're here" is
    // the one against the title.
    expect(marks()).toEqual([
      {
        game: "hades2",
        current: true,
        label: "Hades II — you are here",
        href: GAME_HASH.hades2,
      },
      {
        game: "hades1",
        current: false,
        label: "Switch to Hades",
        href: GAME_HASH.hades1,
      },
    ]);

    await follow(GAME_HASH.hades1);
    expect(marks().map((m) => m.game)).toEqual(["hades1", "hades2"]);
  });

  /**
   * Clipped rather than removed, so the slide has something to animate — which
   * is also why the link carries its own name: the visible halves read as two
   * fragments and the label reads as one thing.
   */
  it("keeps the second half of a mark in the document", async () => {
    await mount();
    const said = [...container.querySelectorAll(".app__markmore")].map((el) => el.textContent);
    expect(said).toEqual(["|You're here!", "|Switch to Hades"]);
  });

  it("says which game the header is in, so the name can take its colour", async () => {
    await mount();
    expect(container.querySelector(".app__head")?.getAttribute("data-game")).toBe("hades2");

    await follow("#/");
    expect(container.querySelector(".app__head")?.getAttribute("data-game")).toBeNull();
  });

  /**
   * The run-wide controls act on a session, so a page with no game has none —
   * and the way in takes their place.
   */
  it("swaps the run's controls for the way in on a page with no game", async () => {
    await mount();
    expect(container.querySelector(".app__goalstoggle")).not.toBeNull();
    expect(container.querySelector(".app__open")).toBeNull();

    await follow("#/");
    expect(container.querySelector(".app__goalstoggle")).toBeNull();
    expect(container.querySelector(".app__finish")).toBeNull();
    expect(container.querySelector(".app__mark")).toBeNull();

    const games = [...container.querySelectorAll<HTMLAnchorElement>(".app__opengame")];
    expect(games.map((a) => a.getAttribute("href"))).toEqual([
      GAME_HASH.hades1,
      GAME_HASH.hades2,
    ]);
    // The games' own names, which is what every other surface calls them.
    expect(games.map((a) => a.textContent?.trim())).toEqual(["Hades", "Hades II"]);
  });

  /** Help is the one control on both, which is what being game-agnostic means. */
  it("carries help on every page", async () => {
    await mount();
    expect(container.querySelector(".app__help")).not.toBeNull();

    await follow("#/");
    expect(container.querySelector(".app__help")).not.toBeNull();

    act(() => container.querySelector<HTMLElement>(".app__help")?.click());
    expect(container.querySelector(".help")).not.toBeNull();
  });

  it("opens help from a key on a page with no run at all", async () => {
    await act(async () => {
      root.render(<App store={createMemoryStore()} presence={null} persistent />);
    });

    press("h");
    expect(container.querySelector(".help")).not.toBeNull();
  });
});

/**
 * The save screen: the door into a game from a page that is not one. It is not
 * a state the game is in — moving between the two games walks past it, which is
 * what the games' own save screens do.
 */
describe("the save screen", () => {
  const rows = () =>
    [...container.querySelectorAll<HTMLElement>(".saves__slot")].map(
      (el) =>
        el.querySelector(".saves__what")?.textContent ??
        el.querySelector(".saves__empty")?.textContent ??
        "",
    );

  /** Four rows and always four, so nothing a player is reaching for can move. */
  it("offers a new run and three slots where nothing is stored", async () => {
    window.location.hash = GAME_HASH.hades2;
    await act(async () => {
      root.render(<App store={createMemoryStore()} presence={null} persistent />);
    });

    expect(rows()).toEqual([
      "Start a new run",
      "( Empty Save Slot )",
      "( Empty Save Slot )",
      "( Empty Save Slot )",
    ]);
    // The god bar is behind it, so answering is what gets you in.
    await enterGame();
    expect(container.querySelector(".saves")).toBeNull();
    expect(container.querySelector(".app__gods")).not.toBeNull();
  });

  it("says what the stored run holds, in a slot of its own", async () => {
    const store = createMemoryStore();
    await mount(store);
    tap(APHRODITE_MELEE);
    goal("AllCloseBoon");

    await follow("#/");
    await follow(GAME_HASH.hades2);

    /* Fixed order whatever is present, so a slot never moves under a player:
       the row that starts a run, then the three slots by number. */
    expect(rows()[0]).toBe("Start a new run");
    expect(rows()[1]).toBe("Continue run");
    expect(texts(".saves__stat dt")).toEqual(["Boons", "Gods met", "Goals"]);
    expect(texts(".saves__stat dd")).toEqual(["1", "1", "1"]);
  });

  /** Numbered, so two saved runs are told apart before their counts are read. */
  it("names each slot by its number", async () => {
    await mount();
    toTheDoor();

    expect(texts(".saves__ordinal")).toEqual(["Slot 1", "Slot 2", "Slot 3"]);
  });

  /**
   * Kept rather than filed over, which is the whole of the model: the run
   * somebody is leaving stays in the slot it was played in.
   */
  it("keeps the old run in its slot when a new one is started", async () => {
    await mount();
    tap(APHRODITE_MELEE);
    expect(heldInLoadout(APHRODITE_MELEE)).toBe(true);

    await follow("#/");
    await follow(GAME_HASH.hades2);
    await takeSlot("Start a new run");

    expect(container.querySelector(".saves")).toBeNull();
    expect(heldInLoadout(APHRODITE_MELEE)).toBe(false);

    // Slot 2 is the open one and its run holds nothing, so it reads as free —
    // which is what lets the door be walked again without piling up empties.
    toTheDoor();
    expect(slotLabels()).toEqual([
      "Saved run",
      "( Empty Save Slot )",
      "( Empty Save Slot )",
    ]);
  });

  /**
   * A switch between the two games is not a door. Held above the component that
   * is keyed on the game, or every switch would raise this again.
   */
  it("does not stand between the two games", async () => {
    await mount();
    expect(container.querySelector(".saves")).toBeNull();

    await follow(GAME_HASH.hades1);
    expect(container.querySelector(".saves")).toBeNull();
    expect(container.querySelector(".app__gods")).not.toBeNull();
  });


  it("goes back to the front page rather than into the game", async () => {
    window.location.hash = GAME_HASH.hades2;
    await act(async () => {
      root.render(<App store={createMemoryStore()} presence={null} persistent />);
    });

    await act(async () => {
      container.querySelector<HTMLElement>(".saves__back")?.click();
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    expect(container.querySelector(".home")).not.toBeNull();
  });
});

/**
 * The two states a game route can be in before there is a run to draw. Neither
 * wore the header until the header was something every page has, which made a
 * store that refuses a page with no way off it.
 */
describe("a run that will not open", () => {
  /** Rejects every read, which is the one failure nothing earlier can catch. */
  function deadStore(): RunStore {
    const fail = () => Promise.reject(new Error("storage is gone"));
    return {
      load: fail,
      save: fail,
      clear: fail,
      openSlot: fail,
      setOpenSlot: fail,
    } as unknown as RunStore;
  }

  it("keeps a way back to the front page", async () => {
    window.location.hash = GAME_HASH.hades2;
    await act(async () => {
      root.render(<App store={deadStore()} presence={null} persistent />);
    });

    // The memory fallback catches a refused store, so this is the page a run
    // that fails for any other reason lands on — either way there is a header.
    expect(container.querySelector(".app__head")).not.toBeNull();
    expect(container.querySelector<HTMLAnchorElement>(".app__name")?.getAttribute("href")).toBe(
      "#/",
    );
  });
});

/**
 * The bar on a run that has met nobody. It carried an arbitrary first god for as
 * long as "never empty" was derived rather than structural; the Hub is what
 * makes it structural, and this is that promise finally kept.
 */
describe("an empty bar", () => {
  const bar = () => texts(GOD_TABS).map((t) => t.trim());

  it("shows the Hub alone before a run has met anyone", async () => {
    await mount();
    expect(bar()).toEqual(["Hub"]);
  });

  it("shows the Hub alone again when a new run is started", async () => {
    await mount();
    tap(APHRODITE_MELEE);
    // A god added to plan with as well, since that half is the player's rather
    // than the run's and would otherwise outlive the run it was added for.
    showGod("Athena");
    expect(bar()).toEqual(["Hub", "Aphrodite", "Athena"]);

    await follow("#/");
    await follow(GAME_HASH.hades2);
    await takeSlot("Start a new run");

    expect(bar()).toEqual(["Hub"]);
    expect(container.querySelector('.app__godtab[aria-current="page"]')?.textContent?.trim()).toBe(
      "Hub",
    );
  });
});

/**
 * The weapon tabs, which are the container for every record that belongs to no
 * god. Hammers are the population this exists for and forms are the half that
 * was already in scope with nowhere to live.
 */
describe("the weapon tabs", () => {
  // The tab draws the weapon and names it in hidden text, the way a god tab
  // draws a symbol.
  const weaponTabs = () =>
    [...container.querySelectorAll<HTMLElement>(".app__weapontab")].map((tab) =>
      (tab.getAttribute("title") ?? "").trim(),
    );

  it("carries all six, in the order the game presents them", async () => {
    await mount();

    // The aspect screen's own order, not the alphabetical one the extraction's
    // sorted keys would give.
    expect(weaponTabs()).toEqual([
      "Witch's Staff",
      "Sister Blades",
      "Umbral Flames",
      "Moonstone Axe",
      "Argent Skull",
      "Black Coat",
    ]);
    // The × belongs to a tab a player put up, and nobody put these up.
    expect(container.querySelectorAll(".app__weapontab .app__goddrop")).toHaveLength(0);
  });

  it("opens a page of that weapon's forms and hammers", async () => {
    await mount();

    click("Umbral Flames");

    // Its heading says so: there is no boon on this page.
    expect(container.querySelector(".app__ladder h2")?.textContent).toBe("Aspects and hammers");
    // The four forms lead the page, in the game's own order with the free one
    // first, and they are named where the god page never draws one at all.
    expect(texts(".godpage__band[data-kind='aspect'] .node__name").map((t) => t.trim())).toEqual([
      "Aspect of Melinoë",
      "Aspect of Moros",
      "Aspect of Eos",
      "Aspect of Supay",
    ]);
    expect(container.querySelectorAll(".godpage__band[data-kind='tier'] .node").length).toBeGreaterThan(5);
  });

  /**
   * The two pages read the same records off one table, so a record on both
   * would be one the run could reach two ways. The extractor makes that
   * impossible — no record has both a god and a weapon — and this is the
   * surface saying the same thing.
   */
  it("draws nothing a god page draws", async () => {
    await mount();
    showGod("Aphrodite");
    const onGod = new Set(texts(".node__name").map((t) => t.trim()));

    click("Black Coat");
    const onWeapon = texts(".node__name").map((t) => t.trim());

    expect(onWeapon.length).toBeGreaterThan(0);
    expect(onWeapon.filter((name) => onGod.has(name))).toEqual([]);
  });

  /**
   * A form is equipped, never held, so the source refuses to mark one. The page
   * drew forms as ordinary nodes before this, and a tap on one met an error
   * notice — the gesture was missing rather than wrong, nothing in the app
   * having written `equipped` at all until the weapon page existed.
   */
  it("equips a weapon form rather than marking it", async () => {
    await mount();
    click("Umbral Flames");
    const form = () =>
      container.querySelector<HTMLElement>(".godpage__band[data-kind='aspect'] .node");
    expect(form()?.dataset.state).toBe("Available");

    act(() => form()?.querySelector<HTMLElement>(".node__control")?.click());

    expect(container.querySelector(".notice")).toBeNull();
    expect(form()?.dataset.state).toBe("Obtained");
    // The form says which weapon the run uses, so both fields are written and
    // the tab glows for it.
    const equipped = texts(".loadout__equipped").join(" ");
    expect(equipped).toContain("Umbral Flames");
    expect(equipped).toContain("Aspect of Melinoë");
    // And it takes the top of the tray, which is where the game draws it.
    const first = container.querySelector(".loadout__core .loadout__entry");
    expect(first?.getAttribute("data-trait")).toBe("TorchSpecialDurationAspect");
    // The toast names the weapon too, six forms in each game sharing a name.
    expect(container.querySelector(".toast__what")?.textContent).toContain(
      "Equipped Aspect of Melinoë (Umbral Flames)",
    );
  });

  /**
   * An equipped form reads as Obtained, so a second tap opens its sheet rather
   * than toggling — which is what every other obtained node does. Taking it off
   * is the sheet's own control, and it goes through `equipAspect` because a
   * form never entered `held` for `remove` to find.
   */
  it("takes the form back off from its sheet", async () => {
    await mount();
    click("Umbral Flames");
    const form = () =>
      container.querySelector<HTMLElement>(".godpage__band[data-kind='aspect'] .node");
    act(() => form()?.querySelector<HTMLElement>(".node__control")?.click());
    expect(form()?.dataset.state).toBe("Obtained");

    act(() => form()?.querySelector<HTMLElement>(".node__control")?.click());
    // The only control the sheet offers a form: it cannot be lost in game, and
    // a goal is a boon to collect.
    expect(texts(".sheet button").map((t) => t.trim())).toEqual(["Close", "Remove"]);
    click("Remove");

    expect(container.querySelector(".notice")).toBeNull();
    expect(form()?.dataset.state).toBe("Available");
    // The weapon goes with it. Equipping the form is the only thing that ever
    // set it, so leaving it behind would keep a choice nobody made.
    const kit = texts(".loadout__equipped").join(" ");
    expect(kit).not.toContain("Aspect of Melinoë");
    expect(kit).not.toContain("Umbral Flames");
    expect(container.querySelector(".app__weapontab[data-equipped='true']")).toBeNull();
  });

  /**
   * The Loadout is a second surface onto the same record, and it had the whole
   * action set where the sheet had a narrowed one. Its Remove ran `purge`,
   * which looks in `held` — where a form has never been — so the control was
   * drawn, pressed, and did nothing.
   */
  it("takes the form off from the Loadout too", async () => {
    await mount();
    click("Umbral Flames");
    const form = () =>
      container.querySelector<HTMLElement>(".godpage__band[data-kind='aspect'] .node");
    act(() => form()?.querySelector<HTMLElement>(".node__control")?.click());

    // A card only opens while the rest of the panel is showing.
    click("Expand");
    act(() =>
      container
        .querySelector<HTMLElement>(".loadout__core .loadout__entry .loadout__tile button")
        ?.click(),
    );
    const card = container.querySelector(".loadout__card");
    // One removal, not two: with no god there is no pool, so the pair that
    // differs only in the pool question is a single control.
    expect([...(card?.querySelectorAll("button") ?? [])].map((b) => b.textContent?.trim())).toEqual(
      ["×", "Remove"],
    );

    act(() => card?.querySelector<HTMLElement>(".loadout__cardremove")?.click());

    expect(form()?.dataset.state).toBe("Available");
    expect(texts(".loadout__equipped").join(" ")).not.toContain("Umbral Flames");
  });

  /**
   * A goal is a boon to collect and you start the run with the form you chose.
   * The sheet said so already; the long press reached past it.
   */
  it("sets no goal on a form, however you ask", async () => {
    await mount();
    click("Umbral Flames");
    const control0 = () =>
      container.querySelector<HTMLElement>(
        ".godpage__band[data-kind='aspect'] .node .node__control",
      );

    // The count in the toggle is the whole tell: "Goals" bare means none.
    const goals = () => container.querySelector(".app__goalstoggle")?.textContent?.trim();

    act(() => {
      control0()?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    });
    expect(goals()).toBe("Goals");

    // And the keyboard's way to the same thing.
    act(() => {
      control0()?.dispatchEvent(new KeyboardEvent("keydown", { key: "g", bubbles: true }));
    });
    expect(goals()).toBe("Goals");
  });

  /**
   * A hammer belongs to a weapon rather than to a god, so the pool question the
   * second removal asks has nothing to ask about — it never reaches the state
   * where a boon's own Remove opens that choice.
   */
  it("offers a hammer one removal rather than two", async () => {
    await mount();
    click("Umbral Flames");
    const hammer = () =>
      container.querySelector<HTMLElement>(".godpage__band[data-kind='tier'] .node");
    act(() => hammer()?.querySelector<HTMLElement>(".node__control")?.click());
    act(() => hammer()?.querySelector<HTMLElement>(".node__control")?.click());

    expect(texts(".sheet__removals button").map((t) => t.trim())).toEqual(["Remove"]);
    // Nor is it a goal question any more than a boon's is — that one stays.
    expect(texts(".sheet button").map((t) => t.trim())).toContain("Set as goal");
  });

  /**
   * 65 Hades II hammers declare a Legendary multiplier, and no run is ever
   * offered one: `HeroData.WeaponData.ForceCommon` is true and
   * `IsRarityForcedCommon` returns true for a weapon upgrade unconditionally.
   * Asking the record alone put a rarity menu on a choice that does not exist.
   */
  it("offers no rarity on a hammer, the game forcing them Common", async () => {
    await mount();
    click("Umbral Flames");
    const hammer = container.querySelector<HTMLElement>(
      ".godpage__band[data-kind='tier'] .node",
    );

    act(() => hammer?.querySelector<HTMLElement>(".node__control")?.click());

    expect(container.querySelector(".sheet__rarities")).toBeNull();
  });

  it("marks a hammer the way a boon is marked", async () => {
    await mount();
    click("Umbral Flames");
    const node = () =>
      container.querySelector<HTMLElement>(".godpage__band[data-kind='tier'] .node");
    const hammer = node();
    if (hammer === null) throw new Error("no hammer on the page to mark");
    expect(hammer.dataset.state).toBe("Available");

    act(() => hammer.querySelector<HTMLElement>(".node__control")?.click());

    // Straight into the run on one tap, the gesture a boon takes: a hammer
    // declares no rarity to choose between, so nothing opens first.
    expect(node()?.dataset.state).toBe("Obtained");
  });
});
