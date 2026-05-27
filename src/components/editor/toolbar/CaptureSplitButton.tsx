"use client";

import {
  Monitor,
  Crop,
  AppWindow,
  ChevronDown,
  type LucideIcon,
} from "lucide-react";
import { formatShortcut } from "@/lib/shortcuts";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type CaptureKind = "full" | "area" | "window";

const KINDS: { kind: CaptureKind; label: string; icon: LucideIcon }[] = [
  { kind: "full", label: "Capture full screen", icon: Monitor },
  { kind: "area", label: "Capture area", icon: Crop },
  { kind: "window", label: "Capture window", icon: AppWindow },
];

export function CaptureSplitButton({
  lastKind,
  onCapture,
  accelerators,
}: {
  lastKind: CaptureKind;
  onCapture: (kind: CaptureKind) => void;
  accelerators: Record<CaptureKind, string>;
}) {
  const primary = KINDS.find((k) => k.kind === lastKind) ?? KINDS[0];
  const PrimaryIcon = primary.icon;

  return (
    <div className="inline-flex items-stretch overflow-hidden rounded">
      <button
        type="button"
        onClick={() => onCapture(primary.kind)}
        title={`${primary.label} (${formatShortcut(accelerators[primary.kind])})`}
        aria-label={primary.label}
        className="flex h-8 w-8 items-center justify-center text-neutral-300 hover:bg-neutral-800"
      >
        <PrimaryIcon className="h-4 w-4" aria-hidden />
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              title="Capture options"
              aria-label="Capture options"
              className="flex h-8 w-4 items-center justify-center text-neutral-400 hover:bg-neutral-800"
            >
              <ChevronDown className="h-3 w-3" aria-hidden />
            </button>
          }
        />
        <DropdownMenuContent align="end">
          {KINDS.map((k) => {
            const Icon = k.icon;
            return (
              <DropdownMenuItem
                key={k.kind}
                onClick={() => onCapture(k.kind)}
              >
                <Icon aria-hidden />
                <span>{k.label}</span>
                <DropdownMenuShortcut>
                  {formatShortcut(accelerators[k.kind])}
                </DropdownMenuShortcut>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
