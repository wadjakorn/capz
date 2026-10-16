"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useT } from "@/i18n/useT";
import type { TKey } from "@/i18n/store";
import type { TemplateSelection } from "@/lib/template";
import type { PickerItem } from "./pickerItems";

type AnnotationItem = Extract<PickerItem, { kind: "annotation" }>;

type Props = {
  items: PickerItem[];
  value: TemplateSelection;
  onChange(v: TemplateSelection): void;
  onHover?(id: string | null): void;
};

type Row =
  | { key: string; kind: "annotation"; item: AnnotationItem }
  | { key: string; kind: "group"; type: AnnotationItem["type"]; members: AnnotationItem[] };

const TEXT_MAX = 24;

function truncate(s: string): string {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > TEXT_MAX ? `${one.slice(0, TEXT_MAX)}…` : one;
}

function fmtBytes(n: number): string {
  return n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}

/** Checkbox that supports the indeterminate state; the row handles clicks and keys. */
function Check({
  checked,
  indeterminate,
  label,
  onToggle,
}: {
  checked: boolean;
  indeterminate?: boolean;
  label: string;
  onToggle(): void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = !!indeterminate;
  }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      tabIndex={-1}
      aria-label={label}
      checked={checked}
      onChange={onToggle}
      className="size-3.5 shrink-0 accent-[var(--color-accent,currentColor)]"
    />
  );
}

export function TemplateItemPicker({ items, value, onChange, onHover }: Props) {
  const { t } = useT();
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());

  const annotations = items.filter((i): i is AnnotationItem => i.kind === "annotation");
  const byType = new Map<string, AnnotationItem[]>();
  for (const a of annotations) byType.set(a.type, [...(byType.get(a.type) ?? []), a]);

  const imageRows = items
    .filter((i) => i.kind !== "annotation")
    .map((item) => ({ key: item.kind, item }));
  const annRows: Row[] = [];
  const seen = new Set<string>();
  for (const a of annotations) {
    const members = byType.get(a.type)!;
    if (members.length < 2) {
      annRows.push({ key: a.id, kind: "annotation", item: a });
    } else if (!seen.has(a.type)) {
      seen.add(a.type);
      annRows.push({ key: `group:${a.type}`, kind: "group", type: a.type, members });
    }
  }

  const isChecked = (item: PickerItem): boolean => {
    if (item.kind === "crop") return value.crop;
    if (item.kind === "backdropOn") return value.backdropOn;
    if (item.kind === "backdropLook") return value.backdropLook;
    return value.annotationIds.has(item.id);
  };

  const setAnnotations = (ids: string[], on: boolean) => {
    const next = new Set(value.annotationIds);
    for (const id of ids) (on ? next.add(id) : next.delete(id));
    onChange({ ...value, annotationIds: next });
  };

  const toggleItem = (item: PickerItem) => {
    if (item.kind === "crop") onChange({ ...value, crop: !value.crop });
    else if (item.kind === "backdropOn") onChange({ ...value, backdropOn: !value.backdropOn });
    else if (item.kind === "backdropLook") onChange({ ...value, backdropLook: !value.backdropLook });
    else setAnnotations([item.id], !value.annotationIds.has(item.id));
  };

  const toggleGroup = (members: AnnotationItem[]) => {
    const all = members.every((m) => value.annotationIds.has(m.id));
    setAnnotations(members.map((m) => m.id), !all);
  };

  const flags = items.flatMap((i) => (i.kind === "annotation" ? [] : [isChecked(i)]));
  const states = [...flags, ...annotations.map((a) => isChecked(a))];
  const nOn = states.filter(Boolean).length;
  const toggleAll = () => {
    const on = nOn !== states.length;
    onChange({
      crop: items.some((i) => i.kind === "crop") && on,
      backdropOn: items.some((i) => i.kind === "backdropOn") && on,
      backdropLook: items.some((i) => i.kind === "backdropLook") && on,
      annotationIds: new Set(on ? annotations.map((a) => a.id) : []),
    });
  };

  const typeLabel = (type: AnnotationItem["type"]) =>
    t(`editor.templates.picker.type.${type}` as TKey);

  const itemLabel = (item: PickerItem): string => {
    switch (item.kind) {
      case "crop":
        return t("editor.templates.picker.crop", {
          w: item.crop.w,
          h: item.crop.h,
          x: item.crop.x,
          y: item.crop.y,
        });
      case "backdropOn":
        return t(item.value ? "editor.templates.picker.backdropOn" : "editor.templates.picker.backdropOff");
      case "backdropLook":
        return t("editor.templates.picker.backdropLook");
      default:
        return typeLabel(item.type);
    }
  };

  const detail = (a: AnnotationItem): string => {
    if (a.type === "pin" && a.pinNumber !== undefined) return `#${a.pinNumber}`;
    if (a.type === "text" && a.text) return truncate(a.text);
    if (a.type === "sticker") return a.emoji ?? (a.text ? truncate(a.text) : "");
    if (a.type === "image" && a.w !== undefined && a.h !== undefined) {
      const size = `${Math.round(a.w)}×${Math.round(a.h)}`;
      return a.bytes ? `${size} · ${fmtBytes(a.bytes)}` : size;
    }
    return "";
  };

  const rowKeys = (e: KeyboardEvent, onToggle: () => void, group?: string) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === " ") {
      e.preventDefault();
      onToggle();
    } else if (group && e.key === "ArrowRight") {
      e.preventDefault();
      setOpen((s) => new Set(s).add(group));
    } else if (group && e.key === "ArrowLeft") {
      e.preventDefault();
      setOpen((s) => {
        const n = new Set(s);
        n.delete(group);
        return n;
      });
    }
  };

  const rowCls =
    "flex min-h-7 cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-xs hover:bg-black/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] dark:hover:bg-white/10";

  const Swatch = ({ color }: { color?: string }) =>
    color ? (
      <span className="size-2.5 shrink-0 rounded-full border border-black/20" style={{ background: color }} />
    ) : null;

  const renderAnnotation = (a: AnnotationItem, indent: boolean) => {
    const d = detail(a);
    const label = d ? `${typeLabel(a.type)} ${d}` : typeLabel(a.type);
    return (
      <div
        key={a.id}
        role="treeitem"
        aria-selected={isChecked(a)}
        aria-label={label}
        tabIndex={0}
        className={`${rowCls} ${indent ? "pl-6" : ""}`}
        onClick={(e) => {
          if (e.target === e.currentTarget || !(e.target instanceof HTMLInputElement)) toggleItem(a);
        }}
        onKeyDown={(e) => rowKeys(e, () => toggleItem(a))}
        onMouseEnter={() => onHover?.(a.id)}
        onMouseLeave={() => onHover?.(null)}
        onFocus={() => onHover?.(a.id)}
        onBlur={() => onHover?.(null)}
      >
        <Check checked={isChecked(a)} label={label} onToggle={() => toggleItem(a)} />
        <Swatch color={a.swatch} />
        <span className="truncate">{typeLabel(a.type)}</span>
        {d && <span className="ml-auto truncate text-black/55 dark:text-white/55">{d}</span>}
      </div>
    );
  };

  return (
    <div role="tree" className="flex w-full flex-col gap-0.5">
      <label className={`${rowCls} font-medium`}>
        <Check
          checked={nOn === states.length && states.length > 0}
          indeterminate={nOn > 0 && nOn < states.length}
          label={t("editor.templates.picker.all")}
          onToggle={toggleAll}
        />
        {t("editor.templates.picker.all")}
      </label>

      {imageRows.length > 0 && (
        <>
          <div className="px-1.5 pt-1 text-[11px] font-medium uppercase tracking-wide text-black/55 dark:text-white/55">
            {t("editor.templates.picker.image")}
          </div>
          <div className="px-1.5 text-[11px] text-black/55 dark:text-white/55">
            {t("editor.templates.picker.changesAll")}
          </div>
          {imageRows.map((r) => {
            const label = itemLabel(r.item);
            const on = isChecked(r.item);
            return (
              <div
                key={r.key}
                role="treeitem"
                aria-selected={on}
                aria-label={label}
                tabIndex={0}
                className={rowCls}
                onClick={(e) => {
                  if (!(e.target instanceof HTMLInputElement)) toggleItem(r.item);
                }}
                onKeyDown={(e) => rowKeys(e, () => toggleItem(r.item))}
              >
                <Check checked={on} label={label} onToggle={() => toggleItem(r.item)} />
                <span className="truncate">{label}</span>
              </div>
            );
          })}
        </>
      )}

      {annRows.length > 0 && (
        <div className="px-1.5 pt-1 text-[11px] font-medium uppercase tracking-wide text-black/55 dark:text-white/55">
          {t("editor.templates.picker.annotations")}
        </div>
      )}
      {annRows.map((r) => {
        if (r.kind === "annotation") return renderAnnotation(r.item, false);
        if (r.kind !== "group") return null;
        const n = r.members.filter((m) => value.annotationIds.has(m.id)).length;
        const expanded = open.has(r.type);
        const label = t("editor.templates.picker.group", {
          type: typeLabel(r.type),
          n: r.members.length,
        });
        const Chevron = expanded ? ChevronDown : ChevronRight;
        return (
          <div key={r.key} className="flex flex-col gap-0.5">
            <div
              role="treeitem"
              aria-expanded={expanded}
              aria-selected={n === r.members.length}
              aria-label={label}
              tabIndex={0}
              className={rowCls}
              onClick={(e) => {
                if (!(e.target instanceof HTMLInputElement)) toggleGroup(r.members);
              }}
              onKeyDown={(e) => rowKeys(e, () => toggleGroup(r.members), r.type)}
            >
              <Check
                checked={n === r.members.length}
                indeterminate={n > 0 && n < r.members.length}
                label={label}
                onToggle={() => toggleGroup(r.members)}
              />
              <span className="truncate">{label}</span>
              <button
                type="button"
                tabIndex={-1}
                aria-hidden
                className="ml-auto"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen((s) => {
                    const next = new Set(s);
                    if (!next.delete(r.type)) next.add(r.type);
                    return next;
                  });
                }}
              >
                <Chevron className="size-3.5" />
              </button>
            </div>
            {expanded && r.members.map((m) => renderAnnotation(m, true))}
          </div>
        );
      })}
    </div>
  );
}
