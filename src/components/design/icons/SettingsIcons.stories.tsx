import type { Story } from "@ladle/react";
import { GlassStage } from "../_backdrops/GlassStage";
import {
  KeyboardIcon,
  ImagesIcon,
  GeneralSettingsIcon,
  UpdaterIcon,
  BugsIcon,
  StickersIcon,
  CopyIcon,
  PasteIcon,
} from "./SettingsIcons";

type Item = { label: string; icon: React.ReactNode };

const settingsMenu: Item[] = [
  { label: "Shortcuts", icon: <KeyboardIcon size={28} /> },
  { label: "Output", icon: <ImagesIcon size={28} /> },
  { label: "General", icon: <GeneralSettingsIcon size={28} /> },
  { label: "Updates", icon: <UpdaterIcon size={28} /> },
  { label: "Diagnostics", icon: <BugsIcon size={28} /> },
  { label: "Stickers", icon: <StickersIcon size={28} /> },
];

const allIcons: Item[] = [
  { label: "Keyboard", icon: <KeyboardIcon size={56} /> },
  { label: "Images", icon: <ImagesIcon size={56} /> },
  { label: "Settings", icon: <GeneralSettingsIcon size={56} /> },
  { label: "Updater", icon: <UpdaterIcon size={56} /> },
  { label: "Bugs", icon: <BugsIcon size={56} /> },
  { label: "Stickers", icon: <StickersIcon size={56} /> },
  { label: "Copy", icon: <CopyIcon size={56} /> },
  { label: "Paste", icon: <PasteIcon size={56} /> },
];

export const SettingsMenu: Story = () => (
  <GlassStage>
    <div className="grid gap-6">
      <span className="eyebrow">Settings rail — icons</span>
      <div className="surface max-w-xs p-2">
        <ul className="grid gap-1">
          {settingsMenu.map((item) => (
            <li
              key={item.label}
              className="flex items-center gap-3 rounded-2xl px-3 py-2 text-sm hover:bg-white/10"
              style={{ color: "var(--fg)" }}
            >
              {item.icon}
              <span className="font-medium">{item.label}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  </GlassStage>
);

export const Gallery: Story = () => (
  <GlassStage>
    <div className="grid gap-6">
      <span className="eyebrow">All icons (64px)</span>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        {allIcons.map((item) => (
          <div
            key={item.label}
            className="surface flex flex-col items-center gap-3 p-5"
          >
            {item.icon}
            <span className="text-sm" style={{ color: "var(--fg-2)" }}>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  </GlassStage>
);

export const Sizes: Story = () => (
  <GlassStage>
    <div className="grid gap-6">
      <span className="eyebrow">Size scale (Keyboard)</span>
      <div className="flex items-end gap-6">
        {[20, 28, 40, 56, 80].map((s) => (
          <div key={s} className="flex flex-col items-center gap-2">
            <KeyboardIcon size={s} />
            <span className="text-xs" style={{ color: "var(--fg-3)" }}>{s}px</span>
          </div>
        ))}
      </div>
    </div>
  </GlassStage>
);
