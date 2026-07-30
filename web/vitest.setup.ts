import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Newer Node versions expose their own `localStorage` global, which shadows
// jsdom's inside the jsdom environment and does not implement the full Storage
// interface — `.clear()` in particular is missing.
//
// Fixed here rather than with `--no-experimental-webstorage` in NODE_OPTIONS
// because that flag does not exist on every Node this repo runs on (CI is on 22,
// local machines are ahead of it) and an unrecognised flag in NODE_OPTIONS stops
// Node from starting at all — a green local run would then break CI outright.
//
// Feature-detected rather than version-gated, so it is inert on any Node whose
// global already behaves.
if (typeof globalThis.localStorage?.clear !== "function") {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    writable: true,
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, String(v)),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
      key: (i: number) => [...store.keys()][i] ?? null,
      get length() {
        return store.size;
      },
    },
  });
}

// No `test.globals` in vitest.config.ts, so Testing Library's own auto-cleanup
// (which hooks a global `afterEach`) never registers. Without this, every
// render() in a test file after the first sees the previous test's DOM still
// mounted underneath it.
afterEach(() => cleanup());
