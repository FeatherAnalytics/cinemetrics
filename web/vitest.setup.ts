import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// No `test.globals` in vitest.config.ts, so Testing Library's own auto-cleanup
// (which hooks a global `afterEach`) never registers. Without this, every
// render() in a test file after the first sees the previous test's DOM still
// mounted underneath it.
afterEach(() => cleanup());
