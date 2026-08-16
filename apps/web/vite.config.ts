import react from "@vitejs/plugin-react";
import { type Plugin, defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

/**
 * The production content security policy.
 *
 * No unsafe-inline and no unsafe-eval: the bundler emits external modules and
 * an external stylesheet, the service worker registers from a module rather
 * than from an injected snippet, and the renderer sets styles through the
 * object model rather than through markup, which this does not govern.
 * `connect-src` is 'none' because the whole product runs from a local store and
 * talks to nobody.
 */
const POLICY = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "manifest-src 'self'",
  "connect-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join("; ");

/**
 * Injected into the built page and **only** the built page.
 *
 * Written as a literal in `index.html` it also reached the dev server, which is
 * the one place the policy is wrong: Vite's live-reload client is an inline
 * script and every stylesheet in dev is injected as an inline `<style>`, so
 * `script-src 'self'` and `style-src 'self'` refuse both. The page still runs —
 * the entry module is external — and comes up with no styling at all, which
 * reads as a broken app rather than as a blocked policy.
 *
 * The policy that ships is unchanged, which is the point: this moves where it
 * is applied, not what it says.
 */
function contentSecurityPolicy(): Plugin {
  const meta = `<meta http-equiv="Content-Security-Policy" content="${POLICY}">`;

  return {
    name: "handbook-csp",
    apply: "build",
    transformIndexHtml(html) {
      /**
       * Written into the markup rather than described as a tag, so the emitted
       * attribute is the policy verbatim — the tag form escapes every quote to
       * `&#39;`, which a browser does decode before reading the policy, but
       * "does decode" is a worse thing to rely on for a security control than
       * emitting exactly what was checked in a browser.
       *
       * A missing anchor throws rather than quietly shipping a page with no
       * policy, which is the one failure here that nothing downstream notices.
       */
      if (!html.includes("<head>")) throw new Error("no <head> to put the policy in");
      return html.replace("<head>", `<head>\n    ${meta}`);
    },
  };
}

/**
 * The bundler exists for this app and for nothing else. Every workspace package
 * is still plain TypeScript source with no compile step of its own — Vite reads
 * `src/index.ts` through the workspace link the same way the test runner does,
 * so `packages/*` gained a consumer, not a build.
 */
export default defineConfig({
  build: {
    // Vite otherwise inlines a small module-preload polyfill as a script tag in
    // the built page, which is the one thing standing between this app and a
    // content security policy with no unsafe-inline. Every browser that can
    // install a progressive web app supports module preloading natively.
    modulePreload: { polyfill: false },
    // Art and description text are withdrawable in one place because a
    // component renders whatever the resolver handed it. A bundler that turned
    // a small icon into a data URI would be rewriting that answer on the way
    // past, so nothing is inlined and the whole art set is served as files.
    assetsInlineLimit: 0,
  },
  plugins: [
    contentSecurityPolicy(),
    react(),
    VitePWA({
      // The registration is a line in main.tsx rather than a snippet this
      // plugin writes into the page, because an injected inline script is
      // exactly what a strict policy refuses to run.
      injectRegister: null,
      registerType: "autoUpdate",
      workbox: {
        // The art caches two ways, split on how often a file is asked for.
        //
        // Precached: the 41 drawn on the first paint of any page — god symbols,
        // element marks, slot glyphs, the two panel frames, the placeholder.
        // 520 kB on top of 880. Offline without them, the god bar is empty.
        //
        // Runtime, below: the other 384, which are boon icons and arrive one god
        // page at a time. In the precache they would be 384 more ways for a
        // worker install to fail, and a failed install is an app that stops
        // updating; uncached they are one placeholder on one page.
        //
        // The faces are precached even though they are not fingerprinted
        // either, and the difference is size against consequence: four files
        // and 78 kB, against an installed copy that renders in system fonts
        // the moment it is offline — which is most of what "installable"
        // promises. Workbox gives an unfingerprinted file its own revision
        // hash, so replacing one still busts the entry.
        globPatterns: [
          "**/*.{js,css,html,webmanifest,woff2}",
          "art/official/_missing.webp",
          "art/official/*/{BoonSymbol,Element_,SlotIcon_,Chrome_}*.webp",
        ],
        runtimeCaching: [
          {
            // CacheFirst rather than StaleWhileRevalidate: these files never
            // change without their name changing, since a key is the game's own
            // and a re-extraction of the same key is the same drawing.
            urlPattern: /\/art\/.*\.webp$/,
            handler: "CacheFirst",
            options: {
              cacheName: "art",
              // Comfortably past the 425 the set holds, so the cap is a bound on
              // a runaway rather than a policy about which icons are worth
              // keeping. A year, because the eviction that matters is the user
              // clearing storage.
              expiration: { maxEntries: 600, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
      manifest: {
        name: "Hades Handbook",
        short_name: "Handbook",
        description: "Plan and track boon builds in Hades and Hades II.",
        start_url: "/",
        display: "standalone",
        background_color: "#12100f",
        theme_color: "#12100f",
        icons: [
          { src: "/icons/app-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/app-512.png", sizes: "512x512", type: "image/png" },
        ],
      },
    }),
  ],
});
