import { Fragment, type ReactNode } from "react";

/**
 * Render a translated string that carries light inline markup, so a sentence
 * with a bold word can live in the dictionary as one string (word order
 * differs between Thai and English, so splitting it around the bold part
 * doesn't work).
 *
 * Supported: `<b>…</b>` → <strong>, `<i>…</i>` → <em>, and `{name}` slots
 * filled from `slots` with arbitrary nodes. No nesting, no attributes — the
 * strings are ours, not user input. Call `t(key)` without vars so `{name}`
 * survives to here.
 */
export function rich(s: string, slots: Record<string, ReactNode> = {}): ReactNode {
  const out: ReactNode[] = [];
  const re = /<b>([\s\S]*?)<\/b>|<i>([\s\S]*?)<\/i>|\{(\w+)\}/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index));
    if (m[1] !== undefined) out.push(<strong key={k++}>{m[1]}</strong>);
    else if (m[2] !== undefined) out.push(<em key={k++}>{m[2]}</em>);
    else if (m[3] !== undefined && m[3] in slots) {
      out.push(<Fragment key={k++}>{slots[m[3]]}</Fragment>);
    } else out.push(m[0]);
    last = re.lastIndex;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}
