export default function Home() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8 gap-12">
      {/* Hero */}
      <section className="flex flex-col items-center gap-4 text-center max-w-xl">
        <span className="eyebrow">Shotr</span>
        <h1 className="headline">Capture. Annotate. Share.</h1>
        <p className="text-[var(--fg-3)] text-[var(--text-md)] leading-relaxed">
          A fast, cross-platform screenshot tool built for people who care about
          the details.
        </p>
        <div className="flex gap-3 mt-2">
          <button className="btn btn--primary">Get Started</button>
          <button className="btn btn--secondary">View Docs</button>
        </div>
      </section>

      {/* Feature tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full max-w-2xl">
        <div className="tile">
          <span className="tile-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M3 9h18M9 21V9" />
            </svg>
          </span>
          <p className="text-[var(--fg)] font-medium text-[var(--text-md)]">Area Capture</p>
          <p className="text-[var(--fg-3)] text-[var(--text-sm)]">Drag to select any region across all monitors.</p>
        </div>

        <div className="tile">
          <span className="tile-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
          </span>
          <p className="text-[var(--fg)] font-medium text-[var(--text-md)]">Annotation</p>
          <p className="text-[var(--fg-3)] text-[var(--text-sm)]">Draw, highlight, and label right on the canvas.</p>
        </div>

        <div className="tile">
          <span className="tile-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13" />
            </svg>
          </span>
          <p className="text-[var(--fg)] font-medium text-[var(--text-md)]">One-click Export</p>
          <p className="text-[var(--fg-3)] text-[var(--text-sm)]">Save to file or copy to clipboard instantly.</p>
        </div>
      </div>

      {/* Hotkey list */}
      <div className="surface w-full max-w-2xl">
        <ul className="surface-row-list divide-y divide-[var(--border-subtle)]">
          <li className="flex items-center justify-between px-5 py-3">
            <span className="text-[var(--fg-2)] text-[var(--text-sm)]">Full-screen capture</span>
            <kbd className="text-[var(--fg-3)] text-[var(--text-xs)] font-mono bg-[var(--surface-raised)] border border-[var(--border)] rounded px-2 py-0.5">⌘ ⌥ ⇧ 3</kbd>
          </li>
          <li className="flex items-center justify-between px-5 py-3">
            <span className="text-[var(--fg-2)] text-[var(--text-sm)]">Area capture</span>
            <kbd className="text-[var(--fg-3)] text-[var(--text-xs)] font-mono bg-[var(--surface-raised)] border border-[var(--border)] rounded px-2 py-0.5">⌘ ⌥ ⇧ 4</kbd>
          </li>
          <li className="flex items-center justify-between px-5 py-3">
            <span className="text-[var(--fg-2)] text-[var(--text-sm)]">Open settings</span>
            <kbd className="text-[var(--fg-3)] text-[var(--text-xs)] font-mono bg-[var(--surface-raised)] border border-[var(--border)] rounded px-2 py-0.5">⌘ ,</kbd>
          </li>
        </ul>
      </div>
    </div>
  );
}
