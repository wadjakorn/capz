"use client";

import { Switch } from "@/components/ui/switch";
import { SettingRow } from "./SettingRow";
import type { SettingId } from "./registry";

/** A registry-backed row whose control is a single on/off switch. */
export function SettingToggle({
  id,
  hint,
  checked,
  onChange,
  disabled,
}: {
  id: SettingId;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <SettingRow id={id} hint={hint}>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </SettingRow>
  );
}
