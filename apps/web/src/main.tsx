/**
 * THROWAWAY SCAFFOLDING. The entry point stays; everything it renders goes.
 *
 * One boon drawn in each of its five states, from hand-written facts through
 * the real engine, the real catalog and the real game rules. It is here to
 * prove the stack holds together — bundler, framework, test runner, import
 * boundary, asset path, service worker — and it is not a design. The component
 * library replaces all of it.
 */

import { iconFor, textFor } from "@repo/catalog";
import { boonState } from "@repo/core";
import { createLookups } from "@repo/catalog";
import { createRules } from "@repo/rules-hades1";
import { BoonDiamond } from "@repo/ui";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { FIXTURES, SUBJECT, nameOf, prereqOf } from "./fixture.js";
import "./app.css";

/**
 * The resolver hands back a set-relative key — `official/Artemis_Zeus_01` —
 * and something has to turn that into a URL a browser can fetch. It happens
 * here, once, so the "swap the art set in one place" property survives: the
 * base and the extension are the same for every icon, and the set name is
 * still the resolver's to change.
 *
 * Worth settling properly when the component library lands: this composition
 * arguably belongs in the resolver itself, which would leave components with
 * nothing to compose at all.
 */
function artUrl(trait: string): string {
  return `/art/${iconFor("hades1", trait)}.png`;
}

const rules = createRules();
const lookups = createLookups("hades1");
const prereq = prereqOf(SUBJECT);

function Slice() {
  return (
    <main className="slice">
      <h1>{textFor(nameOf(SUBJECT))}</h1>
      <ol className="slice__ladder">
        {FIXTURES.map(({ state, facts }) => (
          <li key={state}>
            <BoonDiamond
              name={textFor(nameOf(SUBJECT))}
              iconPath={artUrl(SUBJECT)}
              state={boonState(SUBJECT, prereq, facts, rules, lookups)}
            />
          </li>
        ))}
      </ol>
    </main>
  );
}

const host = document.getElementById("root");
if (host === null) throw new Error("no mount point");
createRoot(host).render(
  <StrictMode>
    <Slice />
  </StrictMode>,
);

/**
 * Registered from a module rather than from a snippet written into the page,
 * so the built site needs no inline script and its content security policy
 * needs no exception for one. The dev server has no generated worker to
 * register.
 */
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js");
  });
}
