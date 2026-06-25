export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-3 p-8 text-center">
      <span className="eyebrow">Shotr</span>
      <h1 className="headline">Screenshot capture &amp; annotation</h1>
      <p className="max-w-sm text-[var(--fg-3)] text-[var(--text-sm)]">
        This window isn&rsquo;t used directly &mdash; capture from the tray icon or
        your capture hotkey, then annotate in the editor.
      </p>
    </main>
  );
}
