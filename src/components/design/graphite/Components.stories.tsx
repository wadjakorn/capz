import type { Story } from "@ladle/react";
import { useState } from "react";
import { Settings, Crop, Type, Minus, Plus, Check, X, AlertTriangle, Info } from "lucide-react";
import { GlassStage } from "../_backdrops/GlassStage";

export const Buttons: Story = () => (
  <GlassStage>
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn btn--primary">Primary</button>
        <button type="button" className="btn btn--secondary">Secondary</button>
        <button type="button" className="btn btn--ghost">Ghost</button>
        <button type="button" className="btn btn--danger">Danger</button>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn btn--primary btn--sm">Primary sm</button>
        <button type="button" className="btn btn--secondary btn--sm">Secondary sm</button>
        <button type="button" className="btn btn--ghost btn--sm">Ghost sm</button>
        <button type="button" className="btn btn--danger btn--sm">Danger sm</button>
      </div>
    </div>
  </GlassStage>
);

export const IconButtons: Story = () => (
  <GlassStage>
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" className="btn-icon" aria-label="Settings">
        <Settings size={16} />
      </button>
      <button type="button" className="btn-icon" aria-label="Crop">
        <Crop size={16} />
      </button>
      <button type="button" className="btn-icon" data-active="true" aria-label="Type (active)">
        <Type size={16} />
      </button>
      <button type="button" className="btn-icon" aria-label="Minus" disabled>
        <Minus size={16} />
      </button>
    </div>
  </GlassStage>
);

export const Surfaces: Story = () => (
  <GlassStage>
    <div className="surface max-w-sm w-full overflow-hidden">
      <div className="p-4" style={{ borderBottom: "1px solid var(--border)" }}>
        <p className="text-sm font-semibold" style={{ color: "var(--fg)" }}>Surface card</p>
        <p className="text-xs mt-1" style={{ color: "var(--fg-3)" }}>Using .surface class</p>
      </div>
      <ul className="surface-row-list">
        <li className="flex items-center justify-between px-4 py-3">
          <span className="text-sm" style={{ color: "var(--fg)" }}>Row item one</span>
          <span className="text-xs" style={{ color: "var(--fg-3)" }}>›</span>
        </li>
        <li className="flex items-center justify-between px-4 py-3">
          <span className="text-sm" style={{ color: "var(--fg)" }}>Row item two</span>
          <span className="text-xs" style={{ color: "var(--fg-3)" }}>›</span>
        </li>
        <li className="flex items-center justify-between px-4 py-3">
          <span className="text-sm" style={{ color: "var(--fg)" }}>Row item three</span>
          <span className="text-xs" style={{ color: "var(--fg-3)" }}>›</span>
        </li>
      </ul>
    </div>
  </GlassStage>
);

export const Toolbar: Story = () => {
  const [active, setActive] = useState("crop");
  const tools = [
    { id: "crop", icon: <Crop size={16} />, label: "Crop" },
    { id: "type", icon: <Type size={16} />, label: "Type" },
    { id: "minus", icon: <Minus size={16} />, label: "Minus" },
    { id: "plus", icon: <Plus size={16} />, label: "Plus" },
  ];
  return (
    <GlassStage>
      <div className="toolbar flex items-center gap-1 px-2 py-1.5">
        {tools.map((t) => (
          <button
            key={t.id}
            type="button"
            className="btn-icon"
            data-active={active === t.id ? "true" : undefined}
            aria-label={t.label}
            onClick={() => setActive(t.id)}
          >
            {t.icon}
          </button>
        ))}
      </div>
    </GlassStage>
  );
};

export const Fields: Story = () => (
  <GlassStage>
    <div className="grid gap-4 w-full max-w-sm">
      <input className="field" type="text" placeholder="Text input (.field)" />
      <select className="field">
        <option>Select option (.field)</option>
        <option>Option A</option>
        <option>Option B</option>
      </select>
    </div>
  </GlassStage>
);

export const Switches: Story = () => {
  const [on, setOn] = useState(false);
  return (
    <GlassStage>
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-3">
          <button
            type="button"
            role="switch"
            aria-checked={on}
            onClick={() => setOn((v) => !v)}
            className="switch"
          >
            <span className="switch-thumb" />
          </button>
          <span className="text-sm" style={{ color: "var(--fg)" }}>{on ? "On" : "Off"}</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            role="switch"
            aria-checked={true}
            className="switch"
          >
            <span className="switch-thumb" />
          </button>
          <span className="text-sm" style={{ color: "var(--fg)" }}>Always on</span>
        </div>
      </div>
    </GlassStage>
  );
};

export const Segmented: Story = () => {
  const [tab, setTab] = useState("general");
  const tabs = ["general", "shortcuts", "output"];
  return (
    <GlassStage>
      <div className="segmented flex">
        {tabs.map((t) => (
          <button
            key={t}
            type="button"
            className="segmented-item capitalize"
            data-active={tab === t ? "true" : undefined}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
    </GlassStage>
  );
};

export const Tiles: Story = () => (
  <GlassStage>
    <div className="flex flex-wrap gap-4">
      <div className="tile">
        <span className="tile-icon"><Settings size={20} /></span>
        <span className="text-xs" style={{ color: "var(--fg-2)" }}>Settings</span>
      </div>
      <div className="tile">
        <span className="tile-icon"><Crop size={20} /></span>
        <span className="text-xs" style={{ color: "var(--fg-2)" }}>Crop</span>
      </div>
      <div className="tile">
        <span className="tile-icon"><Type size={20} /></span>
        <span className="text-xs" style={{ color: "var(--fg-2)" }}>Text</span>
      </div>
    </div>
  </GlassStage>
);

export const Menu: Story = () => (
  <GlassStage>
    <ul className="menu">
      <li className="menu-item">Copy</li>
      <li className="menu-item">Paste</li>
      <li className="menu-separator" role="separator" />
      <li className="menu-item">Delete</li>
    </ul>
  </GlassStage>
);

export const Badges: Story = () => (
  <GlassStage>
    <div className="flex flex-wrap items-center gap-3">
      <span className="badge">Default</span>
      <span className="badge badge--success">
        <Check size={11} />
        Success
      </span>
      <span className="badge badge--warning">
        <AlertTriangle size={11} />
        Warning
      </span>
      <span className="badge badge--danger">
        <X size={11} />
        Danger
      </span>
      <span className="badge">
        <Info size={11} />
        Info
      </span>
    </div>
  </GlassStage>
);
