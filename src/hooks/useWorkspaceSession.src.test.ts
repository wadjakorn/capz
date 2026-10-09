import { describe, expect, it } from "vitest";

import { srcForDoc } from "@/hooks/useWorkspaceSession";
import type { WorkspaceDoc } from "@/stores/workspaces";

const cfs = (p: string) => `asset://localhost/${encodeURIComponent(p)}`;

function doc(over: Partial<WorkspaceDoc>): WorkspaceDoc {
  return { id: "ws1", image: { kind: "file", path: "/data/workspaces/ws1.png" }, ...over } as WorkspaceDoc;
}

describe("srcForDoc", () => {
  it("changes when a cleared workspace is refilled at the same path (CP-0074)", () => {
    // Clear keeps the id, and adopt names the durable copy `<id>.png`, so the
    // before and after images share a path. Only the capture differs.
    const before = doc({ sourcePath: "/tmp/capz-temp-1000.png" });
    const after = doc({ sourcePath: "/tmp/capz-temp-2000.png" });
    expect(srcForDoc(before, cfs)).not.toBe(srcForDoc(after, cfs));
  });

  it("is stable for the same doc, so preload and stage share a cache entry", () => {
    const d = doc({ sourcePath: "/tmp/capz-temp-1000.png" });
    expect(srcForDoc(d, cfs)).toBe(srcForDoc({ ...d }, cfs));
  });

  it("still differs per workspace for a shared path", () => {
    expect(srcForDoc(doc({ id: "a" }), cfs)).not.toBe(srcForDoc(doc({ id: "b" }), cfs));
  });

  it("passes blob URLs and missing images through", () => {
    expect(srcForDoc(doc({ image: { kind: "blob", url: "blob:x" } }), cfs)).toBe("blob:x");
    expect(srcForDoc(doc({ image: null }), cfs)).toBe("");
  });
});
