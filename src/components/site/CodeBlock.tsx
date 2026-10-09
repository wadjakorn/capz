import { CopyButton } from "./CopyButton";

export function CodeBlock({ command, copyLabel }: { command: string; copyLabel: string }) {
  return (
    <div className="codeblock">
      <code>
        <span aria-hidden className="prompt">$ </span>
        {command}
      </code>
      <CopyButton text={command} label={copyLabel} />
    </div>
  );
}
