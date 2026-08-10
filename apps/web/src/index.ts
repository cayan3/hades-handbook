/**
 * The web app: two layout profiles, phone and desktop. Installable as a
 * progressive web app (a PWA, which can be added to a phone's home screen and
 * launched "like an app", w/ a service worker for offline), with persistence
 * in IndexedDB (so survives browser reloads w/o uploading anything/having
 * any accounts or servers) (IndexedDB instead of `localStorage` bc the state
 * is structured (e.g. maps of held traits, pool, elements) and can uh grow lol).
 *
 * The page itself is `index.html` and `src/main.tsx`, which is what the
 * bundler builds. This module is the app's importable face and stays empty:
 * nothing imports an application, and the import-boundary rules say so.
 */

export {};
