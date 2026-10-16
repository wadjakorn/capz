// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const prepareApply = vi.fn(() => Promise.resolve(null));
vi.mock("@/lib/applyTemplateTo", () => ({
  ACTIVE: "active",
  applyTemplateTo: vi.fn(),
  prepareApply: () => prepareApply(),
  showApplyToast: vi.fn(),
}));

import { useTemplateDrag } from "./useTemplateDrag";
import type { EditTemplate } from "@/lib/template";

const tpl = { id: "t", thumb: "" } as unknown as EditTemplate;

function press(target: Element, currentTarget: Element) {
  const { result } = renderHook(() => useTemplateDrag(tpl));
  result.current.onPointerDown({
    target,
    currentTarget,
    button: 0,
    clientX: 0,
    clientY: 0,
  } as unknown as React.PointerEvent);
}

afterEach(() => {
  vi.restoreAllMocks();
  prepareApply.mockClear();
});

describe("useTemplateDrag pointerdown guard", () => {
  it("starts a drag from the card body", () => {
    const add = vi.spyOn(window, "addEventListener");
    const card = document.createElement("div");
    const body = document.createElement("span");
    card.appendChild(body);
    press(body, card);
    expect(prepareApply).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledWith("pointermove", expect.any(Function));
  });

  it("ignores a portaled target outside currentTarget", () => {
    const add = vi.spyOn(window, "addEventListener");
    const card = document.createElement("div");
    const portaled = document.createElement("div");
    press(portaled, card);
    expect(prepareApply).not.toHaveBeenCalled();
    expect(add).not.toHaveBeenCalledWith("pointermove", expect.any(Function));
  });

  it.each(["input", "textarea", "select", "label", "div[role=dialog]"])(
    "ignores a press inside %s",
    (sel) => {
      const add = vi.spyOn(window, "addEventListener");
      const card = document.createElement("div");
      const host = document.createElement(sel.startsWith("div") ? "div" : sel);
      if (sel.includes("role")) host.setAttribute("role", "dialog");
      const inner = document.createElement("span");
      host.appendChild(inner);
      card.appendChild(host);
      press(inner, card);
      expect(prepareApply).not.toHaveBeenCalled();
      expect(add).not.toHaveBeenCalledWith("pointermove", expect.any(Function));
    },
  );
});
