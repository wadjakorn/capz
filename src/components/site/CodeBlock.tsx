import { CopyButton } from "./CopyButton";

export function CodeBlock({ command }: { command: string }) {
  return (
    <div className="group relative flex items-center justify-between gap-4 rounded-lg border border-border bg-surface px-4 py-3 font-mono text-sm">
      <div className="flex items-center gap-3 overflow-x-auto">
        <span aria-hidden className="select-none text-muted-foreground">
          $
        </span>
        <code className="whitespace-nowrap text-foreground">{command}</code>
      </div>
      <CopyButton text={command} label="Copy command" />
    </div>
  );
}
