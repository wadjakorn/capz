import { describe, it, expect, vi, beforeEach } from "vitest";
import { useWorkspaces } from "@/stores/workspaces";

const order: string[] = [];
const runPreCloseAction = vi.fn(async (opts?: { alreadyCopied?: boolean }) => {
  order.push(`preClose:${opts?.alreadyCopied ? "copied" : "plain"}`);
});
const hide = vi.fn(async () => {
  order.push("hide");
});
vi.mock("@/lib/preClose", () => ({ runPreCloseAction }));
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: () => ({ hide }) }));

const { closeEditor } = await import("./closeEditor");

describe("closeEditor", () => {
  beforeEach(() => {
    order.length = 0;
    vi.clearAllMocks();
    useWorkspaces.setState({
      commitActive: () => order.push("commit"),
      flushPersist: async () => {
        order.push("flush");
      },
    });
  });

  it("commits + flushes the workspace, runs the close action, then hides", async () => {
    await closeEditor();
    expect(order).toEqual(["commit", "flush", "preClose:plain", "hide"]);
  });

  it("passes alreadyCopied through to the close action (CP-0067)", async () => {
    await closeEditor({ alreadyCopied: true });
    expect(order).toEqual(["commit", "flush", "preClose:copied", "hide"]);
  });
});
