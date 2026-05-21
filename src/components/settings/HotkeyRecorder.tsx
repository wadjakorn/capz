"use client";

import { useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { eventToAccelerator, formatShortcut, isReserved } from "@/lib/shortcuts";

type Props = {
  value: string;
  onChange: (accel: string) => void;
};

export function HotkeyRecorder({ value, onChange }: Props) {
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!recording) return;
    e.preventDefault();
    e.stopPropagation();
    const accel = eventToAccelerator(e.nativeEvent);
    if (!accel) return;
    if (isReserved(accel)) {
      setError(`${accel} is reserved by the OS`);
      return;
    }
    setError(null);
    onChange(accel);
    setRecording(false);
    ref.current?.blur();
  }

  const display = recording ? "Press keys…" : formatShortcut(value) || "Click to record";

  return (
    <div className="flex flex-col gap-1">
      <Input
        ref={ref}
        readOnly
        value={display}
        onFocus={() => {
          setRecording(true);
          setError(null);
        }}
        onBlur={() => setRecording(false)}
        onKeyDown={handleKey}
        className="font-mono cursor-pointer"
      />
      {error && <span className="text-xs text-red-500">{error}</span>}
    </div>
  );
}
