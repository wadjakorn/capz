import { Fragment } from "react";
import { splitUnits } from "./thaiUnits";

/**
 * Renders a display string as unbreakable word units so Thai headings never
 * wrap mid-word ("แต่งพื้น/หลัง"); breaks happen only at spaces and U+200B.
 */
export function ThaiText({ children }: { children: string }) {
  const units = splitUnits(children);
  return (
    <>
      {units.map((u, i) => (
        <Fragment key={i}>
          <span className="nw">{u.text}</span>
          {i < units.length - 1 && (u.space ? " " : <wbr />)}
        </Fragment>
      ))}
    </>
  );
}
