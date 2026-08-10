import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

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
        globPatterns: ["**/*.{js,css,html,webmanifest}"],
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
