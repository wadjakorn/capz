import { describe, expect, it } from "vitest";
import { buildIssue, type FeedbackRow } from "./github";

const row: FeedbackRow = {
  id: 12,
  created_at: "2026-09-12T10:00:00.000Z",
  kind: "bug",
  message: "Scroll capture stops after 3 pages\n\nSteps: open Safari, hit the hotkey.",
  version: "0.12.0",
  target: "darwin",
  arch: "aarch64",
};

describe("buildIssue", () => {
  it("titles with kind + first line, labels bugs as bug", () => {
    const issue = buildIssue(row);
    expect(issue.title).toBe("[bug] Scroll capture stops after 3 pages");
    expect(issue.labels).toEqual(["bug"]);
  });
  it("labels features as enhancement", () => {
    expect(buildIssue({ ...row, kind: "feature" }).labels).toEqual(["enhancement"]);
    expect(buildIssue({ ...row, kind: "feature" }).title.startsWith("[feature] ")).toBe(true);
  });
  it("truncates long titles to 70 chars", () => {
    const issue = buildIssue({ ...row, message: "a".repeat(200) });
    expect(issue.title.length).toBeLessThanOrEqual("[bug] ".length + 70);
    expect(issue.title.endsWith("...")).toBe(true);
  });
  it("puts the full message in a fenced block plus a metadata table", () => {
    const { body } = buildIssue(row);
    expect(body).toContain("```text\nScroll capture stops after 3 pages\n\nSteps: open Safari, hit the hotkey.\n```");
    expect(body).toContain("| version | 0.12.0 |");
    expect(body).toContain("| target | darwin |");
    expect(body).toContain("| arch | aarch64 |");
    expect(body).toContain("| feedback id | 12 |");
  });
  it("renders missing metadata as dashes", () => {
    const { body } = buildIssue({ ...row, version: null, target: "", arch: null });
    expect(body).toContain("| version | - |");
    expect(body).toContain("| target | - |");
    expect(body).toContain("| arch | - |");
  });
  it("neutralises code fences inside the user message", () => {
    const { body } = buildIssue({ ...row, message: "x\n```\n# pwned\n```" });
    const fences = body.match(/```/g) ?? [];
    expect(fences).toHaveLength(2);
  });
});
