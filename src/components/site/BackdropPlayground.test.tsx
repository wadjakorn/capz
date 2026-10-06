// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { BackdropPlayground } from "./BackdropPlayground";
import { BACKDROP_PRESETS } from "@/lib/backdrop";

afterEach(cleanup);

describe("BackdropPlayground", () => {
  it("offers exactly the app's presets, tab by tab", () => {
    HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;
    render(<BackdropPlayground />);
    const tabs = screen.getAllByRole("tab");
    const shown: string[] = [];
    for (const name of ["Gradient", "Minimal", "Art"]) {
      fireEvent.click(tabs.find((t) => t.textContent === name)!);
      shown.push(...screen.getAllByRole("radio").map((r) => r.getAttribute("aria-label")!));
    }
    expect(shown).toEqual(BACKDROP_PRESETS.map((p) => p.name));
  });
});
