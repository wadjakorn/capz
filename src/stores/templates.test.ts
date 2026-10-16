import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

const toast = vi.fn();
vi.mock("sonner", () => ({ toast: (...a: unknown[]) => toast(...a) }));

import {
  __setTemplatesBackend,
  nextTemplateName,
  reviveTemplate,
  useTemplates,
  type TemplatesBackend,
} from "@/stores/templates";
import type { BackdropLook, EditTemplate } from "@/lib/template";

const look: BackdropLook = {
  style: "gradient",
  presetId: "p1",
  solidColor: "#fff",
  padding: 10,
  cornerRadius: 4,
  shadow: true,
};
const tpl = (id: string, name = id): EditTemplate => ({
  id,
  name,
  createdAt: 1,
  sourceSize: { w: 10, h: 10 },
  annotations: [],
  thumb: "",
});

type Fake = {
  [K in keyof TemplatesBackend]: Mock<TemplatesBackend[K]>;
};
function fake(over: Partial<Fake> = {}): Fake {
  const b: Fake = {
    load: vi.fn(async () => ({ has: false, value: undefined as unknown })),
    set: vi.fn(async (_v: EditTemplate[]) => {}),
    save: vi.fn(async () => {}),
    fileExists: vi.fn(async () => false),
    backup: vi.fn(async () => {}),
    ...over,
  };
  return b;
}

beforeEach(() => {
  vi.useFakeTimers();
  toast.mockClear();
  useTemplates.setState({ templates: [], loaded: false });
  __setTemplatesBackend(null);
});

describe("templates store", () => {
  it("ensureLoaded loads once", async () => {
    const b = fake();
    __setTemplatesBackend(b);
    await Promise.all([useTemplates.getState().ensureLoaded(), useTemplates.getState().ensureLoaded()]);
    await useTemplates.getState().ensureLoaded();
    expect(b.load).toHaveBeenCalledTimes(1);
    expect(useTemplates.getState().loaded).toBe(true);
  });

  it("retries load after a failure and keeps existing templates", async () => {
    const b = fake({
      load: vi
        .fn<TemplatesBackend["load"]>()
        .mockRejectedValueOnce(new Error("boom"))
        .mockResolvedValue({ has: true, value: [tpl("old")] }),
    });
    __setTemplatesBackend(b);
    await expect(useTemplates.getState().ensureLoaded()).rejects.toThrow("boom");
    expect(useTemplates.getState().loaded).toBe(false);
    await useTemplates.getState().ensureLoaded();
    expect(useTemplates.getState().loaded).toBe(true);
    await useTemplates.getState().save(tpl("new"));
    await useTemplates.getState().flush();
    expect(b.set.mock.calls.at(-1)![0].map((t) => t.id)).toEqual(["old", "new"]);
    expect(b.load).toHaveBeenCalledTimes(2);
  });

  it("save during a slow load keeps existing templates", async () => {
    let release!: (v: { has: boolean; value: unknown }) => void;
    const b = fake({ load: vi.fn(() => new Promise<{ has: boolean; value: unknown }>((r) => (release = r))) });
    __setTemplatesBackend(b);
    const p = useTemplates.getState().save(tpl("new"));
    release({ has: true, value: [tpl("old")] });
    await p;
    await useTemplates.getState().flush();
    const last = b.set.mock.calls.at(-1)![0];
    expect(last.map((t) => t.id)).toEqual(["old", "new"]);
  });

  it("flush with nothing dirty does not write and does not call backend.load", async () => {
    const b = fake();
    __setTemplatesBackend(b);
    await useTemplates.getState().flush();
    expect(b.load).not.toHaveBeenCalled();
    expect(b.set).not.toHaveBeenCalled();
  });

  it("corrupt guard backs up before first set, once", async () => {
    const order: string[] = [];
    const b = fake({
      fileExists: vi.fn(async () => true),
      backup: vi.fn(async () => void order.push("backup")),
      set: vi.fn(async () => void order.push("set")),
    });
    __setTemplatesBackend(b);
    await useTemplates.getState().save(tpl("a"));
    await useTemplates.getState().flush();
    await useTemplates.getState().save(tpl("b"));
    await useTemplates.getState().flush();
    expect(order[0]).toBe("backup");
    expect(b.backup).toHaveBeenCalledTimes(1);
    expect(toast).toHaveBeenCalledTimes(1);
  });

  it("no backup when file absent", async () => {
    const b = fake();
    __setTemplatesBackend(b);
    await useTemplates.getState().save(tpl("a"));
    await useTemplates.getState().flush();
    expect(b.backup).not.toHaveBeenCalled();
    expect(b.set).toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
  });

  it("write failure toasts and retries on next change", async () => {
    const b = fake({ set: vi.fn(async (_v: EditTemplate[]) => {}).mockRejectedValueOnce(new Error("x")) });
    __setTemplatesBackend(b);
    await useTemplates.getState().save(tpl("a"));
    await useTemplates.getState().flush();
    expect(toast).toHaveBeenCalledTimes(1);
    await useTemplates.getState().flush();
    expect(b.set).toHaveBeenCalledTimes(2);
    expect(b.save).toHaveBeenCalledTimes(1);
  });

  it("rename and remove persist", async () => {
    const b = fake();
    __setTemplatesBackend(b);
    await useTemplates.getState().save(tpl("a"));
    await useTemplates.getState().rename("a", "Z");
    expect(useTemplates.getState().templates[0].name).toBe("Z");
    await useTemplates.getState().remove("a");
    await vi.advanceTimersByTimeAsync(900);
    expect(b.set.mock.calls.at(-1)![0]).toEqual([]);
  });
});

describe("reviveTemplate", () => {
  it("drops malformed entries", () => {
    expect(reviveTemplate(null, look)).toBeNull();
    expect(reviveTemplate({ ...tpl("a"), id: 3 }, look)).toBeNull();
    expect(reviveTemplate({ ...tpl("a"), createdAt: NaN }, look)).toBeNull();
    expect(reviveTemplate({ ...tpl("a"), sourceSize: { w: 0, h: 1 } }, look)).toBeNull();
    expect(reviveTemplate({ ...tpl("a"), annotations: {} }, look)).toBeNull();
    expect(reviveTemplate({ ...tpl("a"), crop: { x: 1, y: 2, w: 3 } }, look)).toBeNull();
    expect(reviveTemplate({ ...tpl("a"), backdropOn: "yes" }, look)).toBeNull();
    expect(reviveTemplate(tpl("a"), look)).not.toBeNull();
    expect(reviveTemplate({ ...tpl("a"), thumb: 5 }, look)!.thumb).toBe("");
  });

  it("repairs backdropLook from currentLook", () => {
    const r = reviveTemplate(
      { ...tpl("a"), backdropLook: { style: "bad", presetId: 1, solidColor: "#000", padding: -3, cornerRadius: 7, shadow: "x" } },
      look,
    )!;
    expect(r.backdropLook).toEqual({ ...look, solidColor: "#000", cornerRadius: 7 });
  });
});

describe("nextTemplateName", () => {
  it("picks the next free N", () => {
    const t = (k: string, v?: Record<string, string | number>) => `T ${v?.n}`;
    expect(nextTemplateName([], t as never)).toBe("T 1");
    expect(nextTemplateName([tpl("a", "T 1"), tpl("b", "T 3")], t as never)).toBe("T 2");
  });
});
