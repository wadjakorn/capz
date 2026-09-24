// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

/**
 * Guards the component-test setup the settings revamp depends on: `.test.tsx`
 * files must be collected, compiled with the automatic JSX runtime, and run
 * against jsdom. Without this the drift guard in SettingsView cannot run.
 */
describe("component test tooling", () => {
  it("renders a component into jsdom", () => {
    render(<p>settings tooling works</p>);
    expect(screen.getByText("settings tooling works")).toBeTruthy();
  });
});
