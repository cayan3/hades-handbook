import type { BoonState, GodId, TraitId, WeaponId } from "@repo/core";
import { type CSSProperties, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { BoonArt, GodArt, WeaponArt } from "./boon-art.js";
import { godColour } from "./god-palette.js";
import { useHoverDisclosure } from "./hover-disclosure.js";
import { useGame } from "./presentation.js";

/** One thing the adder offers: a tab to open, or a boon to put in the run. */
export type AddItem =
  | { readonly kind: "god"; readonly god: GodId }
  | { readonly kind: "weapon"; readonly weapon: WeaponId; readonly name: string }
  | {
      readonly kind: "record";
      readonly trait: TraitId;
      readonly name: string;
      /** Null where nobody offers it, which leaves the row its neutral. */
      readonly god: GodId | null;
      /** Both gods for a Duo, and a kind for anything no god hands out. */
      readonly whose: string | null;
      readonly iconKey: string;
      readonly state: BoonState;
    };

/** A branch: a label and what opens under it, which may be more branches. */
export interface Category {
  readonly id: string;
  readonly label: string;
  readonly entries: readonly Entry[];
}

export type Entry = AddItem | Category;

function isCategory(entry: Entry): entry is Category {
  return (entry as Category).entries !== undefined;
}

function labelOf(item: AddItem): string {
  return item.kind === "god" ? item.god : item.name;
}

function keyOf(item: AddItem): string {
  return item.kind === "god" ? item.god : item.kind === "weapon" ? item.weapon : item.trait;
}

/**
 * How deep the list goes. The tree is authored once and folded here, so trying a
 * different shape is a prop rather than a rewrite.
 */
export type Arrangement = "flat" | "layered" | "one-others" | "tree";

/** Fold a tree down to the depth an arrangement allows. */
function arrange(root: readonly Entry[], how: Arrangement): readonly Entry[] {
  switch (how) {
    case "tree":
      return root;
    case "one-others":
      // Every branch under a branch is spilled into its parent: one Others list.
      return root.map((entry) =>
        isCategory(entry) ? { ...entry, entries: leavesOf(entry) } : entry,
      );
    case "flat":
      return root.flatMap((entry) => (isCategory(entry) ? leavesOf(entry) : entry));
    case "layered": {
      // Gods gain a category of their own, so every root row opens something.
      const gods = root.filter((entry): entry is AddItem => !isCategory(entry));
      const rest = root.filter(isCategory);
      const olympians: Category = { id: "olympians", label: "Olympians", entries: gods };
      const spilled = rest.flatMap((category) => category.entries);
      return gods.length === 0 ? spilled : [olympians, ...spilled];
    }
  }
}

function leavesOf(category: Category): readonly AddItem[] {
  return category.entries.flatMap((entry) => (isCategory(entry) ? leavesOf(entry) : entry));
}

export interface AdderProps {
  /** Gods at the root, branches after them. `arrangement` folds it from there. */
  readonly root: readonly Entry[];
  /** Everything the search may find, which is not the same set as the tree. */
  readonly searchable: readonly AddItem[];
  readonly onPickGod: (god: GodId) => void;
  readonly onPickWeapon: (weapon: WeaponId) => void;
  readonly onMark: (trait: TraitId) => void;
  readonly arrangement?: Arrangement;
  /** Whether a record row says what state the run has it in. */
  readonly rowStyle?: "plain" | "stateful";
  /** Whether a family's hits cluster under the god that offers them. */
  readonly grouped?: boolean;
}

export function Adder({
  root,
  searchable,
  onPickGod,
  onPickWeapon,
  onMark,
  arrangement = "layered",
  rowStyle = "stateful",
  grouped = true,
}: AdderProps) {
  const { open, opener, wrapper, toggle, close } = useHoverDisclosure();
  const [query, setQuery] = useState("");
  const [trail, setTrail] = useState<readonly string[]>([]);
  /** Which result the arrows are on. Never focused — see `aria-activedescendant`. */
  const [active, setActive] = useState(0);
  const field = useRef<HTMLInputElement | null>(null);
  const head = useRef<HTMLDivElement | null>(null);
  /**
   * How far to lift the panel so the first option lines up with the `+` instead
   * of the search field doing. Measured, since its height is the stylesheet's.
   */
  const [lift, setLift] = useState(0);

  const entries = useMemo(() => arrange(root, arrangement), [root, arrangement]);
  const results = useMemo(() => rank(searchable, query, grouped), [searchable, query, grouped]);
  const searching = query.trim().length > 0;
  const on = results[Math.min(active, results.length - 1)];

  useLayoutEffect(() => {
    if (open) setLift(head.current?.offsetHeight ?? 0);
  }, [open]);

  // Focus never moves, so nothing else scrolls the row the arrows are on back
  // into view, and the walk carried on down a list nobody could see.
  useEffect(() => {
    if (on === undefined) return;
    const row = document.getElementById(`adder-${keyOf(on)}`);
    row?.scrollIntoView?.({ block: "nearest" });
  }, [on]);

  // Ready to type into, and never showing the last search.
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setTrail([]);
    setActive(0);
    field.current?.focus();
  }, [open]);

  function pick(item: AddItem): void {
    if (item.kind === "god") onPickGod(item.god);
    else if (item.kind === "weapon") onPickWeapon(item.weapon);
    else onMark(item.trait);
    close();
  }

  return (
    <div
      className="adder"
      {...wrapper}
      onKeyDown={(event) => {
        if (!open) return wrapper.onKeyDown(event);
        // Focus stays in the field so a query can still be corrected mid-walk;
        // `aria-activedescendant` is what a reader follows instead. It is also
        // the only version of this that sets no tab index.
        if (searching && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
          event.preventDefault();
          const step = event.key === "ArrowDown" ? 1 : -1;
          setActive((now) =>
            Math.max(0, Math.min(results.length - 1, Math.min(now, results.length - 1) + step)),
          );
          return;
        }
        if (searching && event.key === "Enter" && on !== undefined) {
          event.preventDefault();
          pick(on);
          return;
        }
        // Escape steps back out one level at a time, and stops here — the pause
        // panel opens on the presses nothing else has answered.
        if (event.key === "Escape") {
          event.stopPropagation();
          if (searching) {
            setQuery("");
            field.current?.focus();
            return;
          }
          if (trail.length > 0) {
            setTrail(trail.slice(0, -1));
            return;
          }
        }
        wrapper.onKeyDown(event);
      }}
    >
      <button
        type="button"
        ref={opener}
        className="adder__open"
        aria-expanded={open}
        onClick={toggle}
      >
        <span aria-hidden="true">+</span>
        <span className="visually-hidden">Add to this run</span>
      </button>

      {!open ? null : (
        <div
          className="adder__panel"
          style={{ "--adder-lift": `${lift}px` } as CSSProperties}
        >
          <div className="adder__search" ref={head}>
            <span className="adder__glass" aria-hidden="true">
              ⌕
            </span>
            <input
              ref={field}
              type="search"
              className="adder__field"
              value={query}
              placeholder="Search"
              aria-label="Search this game"
              aria-controls="adder-results"
              aria-activedescendant={
                searching && on !== undefined ? `adder-${keyOf(on)}` : undefined
              }
              onChange={(event) => {
                setQuery(event.target.value);
                setTrail([]);
                setActive(0);
              }}
            />
          </div>

          {searching ? (
            <ul className="adder__list adder__results" id="adder-results">
              {results.length === 0 ? (
                <li className="adder__none">Nothing by that name.</li>
              ) : (
                results.map((item) => (
                  <li key={keyOf(item)}>
                    <Row
                      item={item}
                      style={rowStyle}
                      active={on !== undefined && keyOf(on) === keyOf(item)}
                      onPick={() => pick(item)}
                    />
                  </li>
                ))
              )}
            </ul>
          ) : (
            <Levels
              entries={entries}
              trail={trail}
              rowStyle={rowStyle}
              // Replace rather than append, or moving the pointer to a
              // neighbouring branch leaves the first one open beside it.
              onOpen={(depth, id) => setTrail([...trail.slice(0, depth), id])}
              onPick={pick}
            />
          )}
        </div>
      )}
    </div>
  );
}

/** One list per open level, side by side. What is open is a path, so it is kept
    as one. */
function Levels({
  entries,
  trail,
  rowStyle,
  onOpen,
  onPick,
}: {
  readonly entries: readonly Entry[];
  readonly trail: readonly string[];
  readonly rowStyle: "plain" | "stateful";
  readonly onOpen: (depth: number, id: string) => void;
  readonly onPick: (item: AddItem) => void;
}) {
  const lists: (readonly Entry[])[] = [entries];
  let here: readonly Entry[] = entries;
  for (const step of trail) {
    const found = here.find((entry) => isCategory(entry) && entry.id === step);
    if (found === undefined || !isCategory(found)) break;
    lists.push(found.entries);
    here = found.entries;
  }

  return (
    <div className="adder__levels">
      {lists.map((list, depth) => (
        <ul className="adder__list" key={trail.slice(0, depth).join("/") || "root"}>
          {list.map((entry) =>
            isCategory(entry) ? (
              <li key={entry.id}>
                <button
                  type="button"
                  className="adder__branch"
                  aria-expanded={trail[depth] === entry.id}
                  onClick={() => onOpen(depth, entry.id)}
                  onMouseEnter={() => onOpen(depth, entry.id)}
                  onFocus={() => onOpen(depth, entry.id)}
                >
                  <span className="adder__name">{entry.label}</span>
                  <span className="adder__chevron" aria-hidden="true">
                    ›
                  </span>
                </button>
              </li>
            ) : (
              <li key={keyOf(entry)}>
                <Row item={entry} style={rowStyle} onPick={() => onPick(entry)} />
              </li>
            ),
          )}
        </ul>
      ))}
    </div>
  );
}

/**
 * One row, whichever kind it is. The state goes beside the name rather than in
 * the right-hand column, which keeps that column a straight edge down the list.
 */
function Row({
  item,
  style,
  active,
  onPick,
}: {
  readonly item: AddItem;
  readonly style: "plain" | "stateful";
  readonly active?: boolean;
  readonly onPick: () => void;
}) {
  const game = useGame();
  const god = item.kind === "weapon" ? null : item.kind === "god" ? item.god : item.god;
  const state = style === "stateful" && item.kind === "record" ? stateWord(item.state) : "";

  return (
    <button
      type="button"
      id={`adder-${keyOf(item)}`}
      className="adder__row"
      data-kind={item.kind}
      data-active={active ? "true" : undefined}
      style={god === null ? undefined : ({ "--god": godColour(god) } as CSSProperties)}
      onClick={onPick}
      aria-label={accessibleName(item)}
    >
      {item.kind === "god" ? (
        <GodArt game={game} god={item.god} className="adder__art" />
      ) : item.kind === "weapon" ? (
        <WeaponArt game={game} weapon={item.weapon} className="adder__art" />
      ) : (
        <BoonArt iconKey={item.iconKey} />
      )}
      <span className="adder__name">{labelOf(item)}</span>
      {state === "" ? null : <span className="adder__state">{state}</span>}
      {item.kind !== "record" || item.whose === null ? null : (
        <span className="adder__meta">{item.whose}</span>
      )}
    </button>
  );
}

/** Said only where it is worth saying: most of what you search for is Available. */
function stateWord(state: BoonState): string {
  if (state === "Available") return "";
  return state === "Obtained" ? "held" : state.toLowerCase();
}

function accessibleName(item: AddItem): string {
  if (item.kind === "god") return `${item.god} — open this god's tab`;
  if (item.kind === "weapon") return `${item.name} — open this weapon's tab`;
  const whose = item.whose === null ? "" : ` — ${item.whose}`;
  return `${item.name}${whose} — ${item.state}`;
}

/**
 * Best first, in bands.
 *
 * A tab beats a boon on the same prefix — "aphro" is asking for Aphrodite, and
 * her boons are what going there gives you. The games name in families, so
 * "strike" matches nine records in Hades I and ten in Hades II; the bands put
 * the ones that start with the word above the ones that merely contain it, and
 * grouping keeps each god's hits together.
 */
function rank(items: readonly AddItem[], query: string, grouped: boolean): readonly AddItem[] {
  const q = query.trim().toLowerCase();
  if (q === "") return [];
  const scored: { item: AddItem; band: number }[] = [];
  for (const item of items) {
    const band = bandOf(item, q);
    if (band >= 0) scored.push({ item, band });
  }
  const byBand = (a: (typeof scored)[number], b: (typeof scored)[number]) => {
    if (a.band !== b.band) return a.band - b.band;
    // Un-held first: you came here to add something.
    const held = Number(isHeld(a.item)) - Number(isHeld(b.item));
    return held !== 0 ? held : labelOf(a.item).localeCompare(labelOf(b.item));
  };
  scored.sort(byBand);
  if (!grouped) return scored.map((entry) => entry.item);

  /* A god's group sits where their best hit was. Tabs stand alone. */
  const order: string[] = [];
  const groups = new Map<string, typeof scored>();
  for (const entry of scored) {
    const key =
      entry.item.kind === "record" ? (entry.item.whose ?? "￿") : ` ${keyOf(entry.item)}`;
    let group = groups.get(key);
    if (group === undefined) {
      group = [];
      groups.set(key, group);
      order.push(key);
    }
    group.push(entry);
  }
  return order.flatMap((key) => (groups.get(key) ?? []).map((entry) => entry.item));
}

function bandOf(item: AddItem, q: string): number {
  const name = labelOf(item).toLowerCase();
  const words = name.split(/[\s-]+/);
  if (name === q) return 0;
  if (item.kind !== "record") {
    if (name.startsWith(q) || words.some((word) => word.startsWith(q))) return 1;
    return name.includes(q) ? 4 : -1;
  }
  if (name.startsWith(q)) return 2;
  if (words.some((word) => word.startsWith(q))) return 3;
  if (name.includes(q)) return 4;
  return (item.god?.toLowerCase().startsWith(q) ?? false) ? 5 : -1;
}

function isHeld(item: AddItem): boolean {
  return item.kind === "record" && item.state === "Obtained";
}
