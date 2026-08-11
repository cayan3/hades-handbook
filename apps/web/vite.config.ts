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
        // The art set is served from public/ and never fingerprinted, so it is
        // matched at runtime instead of being listed in the precache manifest.
        //
        // The faces are precached even though they are not fingerprinted
        // either, and the difference is size against consequence: four files
        // and 78 kB, against an installed copy that renders in system fonts
        // the moment it is offline — which is most of what "installable"
        // promises. Workbox gives an unfingerprinted file its own revision
        // hash, so replacing one still busts the entry.
        globPatterns: ["**/*.{js,css,html,webmanifest,woff2}"],
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
