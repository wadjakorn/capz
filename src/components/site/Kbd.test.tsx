// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Kbd } from "./Kbd";
import { KeyPlatformProvider, KeyToggle } from "./keyPlatform";

afterEach(cleanup);

const keys = () => screen.getAllByText((_, el) => el?.tagName === "KBD").map((k) => k.textContent || k.getAttribute("aria-label"));

describe("Kbd", () => {
  it("speaks Mac glyphs by default and Ctrl/Alt/Shift once Windows is picked", () => {
    render(
      <KeyPlatformProvider>
        <KeyToggle />
        {["⌘", "⌥", "⇧", "4"].map((k) => <Kbd key={k} k={k} />)}
      </KeyPlatformProvider>,
    );
    expect(keys()).toEqual(["Command", "Option", "Shift", "4"]);
    fireEvent.click(screen.getByRole("button", { name: "Windows" }));
    expect(keys()).toEqual(["Ctrl", "Alt", "Shift", "4"]);
    expect(screen.getByRole("button", { name: "Windows" }).getAttribute("aria-pressed")).toBe("true");
  });
});
