import { describe, it, expect, vi } from "vitest";
import { makeExt } from "./fixtures";
import { safeEvaluate } from "../src/scoring/engine";
import type { ScoringRule } from "../src/scoring/types";

describe("safeEvaluate", () => {
  it("returns a rule's results unchanged when it does not throw", () => {
    const rule: ScoringRule = {
      id: "ok",
      category: "test",
      evaluate: () => [
        {
          ruleId: "ok-1",
          category: "test",
          description: "fine",
          score: 7,
          severity: "low",
        },
      ],
    };
    expect(safeEvaluate(rule, makeExt())).toEqual([
      {
        ruleId: "ok-1",
        category: "test",
        description: "fine",
        score: 7,
        severity: "low",
      },
    ]);
  });

  it("isolates a throwing rule: logs and returns a zero-score info finding", () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const rule: ScoringRule = {
      id: "boom",
      category: "test",
      evaluate: () => {
        throw new Error("kaboom");
      },
    };
    const results = safeEvaluate(rule, makeExt());
    expect(results).toEqual([
      {
        ruleId: "boom-error",
        category: "test",
        description: 'Rule "boom" failed to evaluate',
        score: 0,
        severity: "info",
      },
    ]);
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});
