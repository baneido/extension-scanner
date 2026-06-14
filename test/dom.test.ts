import { describe, it, expect, afterEach } from "vitest";
import { mustGetElement } from "../src/shared/utils";

// Minimal document stub: mustGetElement only needs getElementById.
function installDocument(ids: Record<string, unknown>) {
  (globalThis as any).document = {
    getElementById: (id: string) => (id in ids ? ids[id] : null),
  };
}

describe("mustGetElement", () => {
  afterEach(() => {
    delete (globalThis as any).document;
  });

  it("returns the element when present", () => {
    const el = { id: "x" };
    installDocument({ x: el });
    expect(mustGetElement("x")).toBe(el);
  });

  it("throws a self-describing error naming the missing id", () => {
    installDocument({});
    expect(() => mustGetElement("scan-time")).toThrowError(
      "Missing required DOM element: #scan-time"
    );
  });
});
