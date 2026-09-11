/**
 * The capture archive: a copy of every screen capture, kept under a size
 * budget, so a capture you never exported is still recoverable.
 *
 * Lives in `<saveDir>/Captures/`, a subfolder of whatever the user configured
 * as their save directory. Three properties follow from that choice and are
 * worth stating, because the obvious alternative (drop them in the save dir
 * and tag them in a store) breaks all three:
 *
 *  - **The directory is the source of truth.** Losing `history.json` costs
 *    thumbnails, never the knowledge of which files are ours — so an archive
 *    can always be enumerated, budgeted and swept.
 *  - **Eviction can never touch a deliberate export.** Nothing outside this
 *    folder is ever a candidate.
 *  - **A human can tell the two apart in Finder**, with the app closed, from
 *    the folder and the `capz-capture-` prefix alone.
 *
 * Every filesystem call goes through tauri-plugin-fs (CLAUDE.md: user-facing
 * writes never use raw Rust std::fs). `copyFile` is a native copy, so a 20MB
 * capture never travels through the webview.
 */

import { isTauriRuntime } from "@/lib/platform";

/** Folder name under the user's save directory. */
export const ARCHIVE_DIR_NAME = "Captures";

/**
 * Prefix for archived files. Deliberately different from the export filename
 * template so the two kinds stay distinguishable in a file browser — the one
 * thing a flag-in-a-database could never provide.
 */
export const ARCHIVE_PREFIX = "capz-capture-";

const MB = 1024 * 1024;

export type ArchiveFile = {
  /** Absolute path. */
  path: string;
  name: string;
  bytes: number;
  /** Epoch ms; the capture time, taken from the file's mtime. */
  at: number;
};

/** Whether a filename is one of ours. Guards every destructive path. */
export function isArchiveName(name: string): boolean {
  return name.startsWith(ARCHIVE_PREFIX) && /\.(png|jpe?g|webp)$/i.test(name);
}

/** Timestamped archive name, mirroring the export template's shape. */
export function archiveFileName(at: Date, ext: string): string {
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  const stamp =
    `${at.getFullYear()}${p(at.getMonth() + 1)}${p(at.getDate())}` +
    `-${p(at.getHours())}${p(at.getMinutes())}${p(at.getSeconds())}` +
    // Two captures inside the same second are entirely possible with a hotkey
    // held down; the millisecond keeps them from colliding.
    `${p(at.getMilliseconds(), 3)}`;
  return `${ARCHIVE_PREFIX}${stamp}.${ext}`;
}

/** File extension of a path, lowercased, defaulting to png. */
export function extOf(path: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(path);
  return m ? m[1].toLowerCase() : "png";
}

/**
 * Which files to evict to bring `files` under `budgetBytes`, oldest first.
 *
 * Pure, so the rule that actually costs the user data is testable without a
 * filesystem. Returns [] when already under budget. A single file larger than
 * the whole budget is still kept: evicting it would leave the user with
 * nothing and it is, by definition, the capture they just took.
 */
export function selectEvictions(
  files: ArchiveFile[],
  budgetBytes: number,
): ArchiveFile[] {
  const total = files.reduce((n, f) => n + f.bytes, 0);
  if (total <= budgetBytes) return [];
  const oldestFirst = [...files].sort((a, b) => a.at - b.at);
  const evict: ArchiveFile[] = [];
  let remaining = total;
  // Stop before the newest file so a capture is never evicted the instant it
  // is taken, however small the budget.
  for (const f of oldestFirst.slice(0, -1)) {
    if (remaining <= budgetBytes) break;
    evict.push(f);
    remaining -= f.bytes;
  }
  return evict;
}

export function totalBytes(files: ArchiveFile[]): number {
  return files.reduce((n, f) => n + f.bytes, 0);
}

export function mbToBytes(mb: number): number {
  return mb * MB;
}

// ---------------------------------------------------------------------------
// Filesystem side. Desktop only — the web build has no save directory.
// ---------------------------------------------------------------------------

/** Absolute path of the archive folder for a given save directory. */
export async function archiveDir(saveDir: string): Promise<string> {
  const { join } = await import("@tauri-apps/api/path");
  return join(saveDir, ARCHIVE_DIR_NAME);
}

/**
 * Every archived file, newest first. Missing folder reads as empty rather than
 * throwing: not having archived anything yet is the normal first-run state.
 */
export async function listArchive(saveDir: string): Promise<ArchiveFile[]> {
  if (!isTauriRuntime()) return [];
  try {
    const dir = await archiveDir(saveDir);
    const { readDir, stat, exists } = await import("@tauri-apps/plugin-fs");
    if (!(await exists(dir))) return [];
    const { join } = await import("@tauri-apps/api/path");
    const entries = await readDir(dir);
    const out: ArchiveFile[] = [];
    for (const e of entries) {
      if (!e.isFile || !isArchiveName(e.name)) continue;
      const path = await join(dir, e.name);
      try {
        const st = await stat(path);
        out.push({
          path,
          name: e.name,
          bytes: st.size ?? 0,
          at: st.mtime ? new Date(st.mtime).getTime() : Date.now(),
        });
      } catch {
        // Vanished between readDir and stat — skip it rather than fail the list.
      }
    }
    return out.sort((a, b) => b.at - a.at);
  } catch (e) {
    console.warn("archive listing failed", e);
    return [];
  }
}

/**
 * Copy a capture into the archive and bring the folder back under budget.
 *
 * Returns the new file, or null if archiving was skipped or failed — never
 * throws. Archiving is a safety net; it must not be able to break a capture.
 */
export async function archiveCapture(
  sourcePath: string,
  saveDir: string,
  budgetMb: number,
): Promise<{ file: ArchiveFile; evicted: ArchiveFile[] } | null> {
  if (!isTauriRuntime()) return null;
  try {
    const dir = await archiveDir(saveDir);
    const { copyFile, mkdir, exists, stat } = await import("@tauri-apps/plugin-fs");
    const { join } = await import("@tauri-apps/api/path");
    if (!(await exists(dir))) await mkdir(dir, { recursive: true });

    const now = new Date();
    const name = archiveFileName(now, extOf(sourcePath));
    const dest = await join(dir, name);
    await copyFile(sourcePath, dest);

    const st = await stat(dest);
    const file: ArchiveFile = {
      path: dest,
      name,
      bytes: st.size ?? 0,
      at: now.getTime(),
    };

    const evicted = await enforceBudget(saveDir, budgetMb);
    return { file, evicted };
  } catch (e) {
    console.error("archiveCapture failed", e);
    return null;
  }
}

/** Evict oldest-first until the folder fits the budget. Returns what went. */
export async function enforceBudget(
  saveDir: string,
  budgetMb: number,
): Promise<ArchiveFile[]> {
  const files = await listArchive(saveDir);
  const evict = selectEvictions(files, mbToBytes(budgetMb));
  if (!evict.length) return [];
  const { remove } = await import("@tauri-apps/plugin-fs");
  const gone: ArchiveFile[] = [];
  for (const f of evict) {
    try {
      await remove(f.path);
      gone.push(f);
    } catch (e) {
      console.warn("archive eviction failed", f.name, e);
    }
  }
  return gone;
}

/** Delete every archived file. Only ever called from an explicit user action. */
export async function deleteArchive(saveDir: string): Promise<number> {
  const files = await listArchive(saveDir);
  if (!files.length) return 0;
  const { remove } = await import("@tauri-apps/plugin-fs");
  let n = 0;
  for (const f of files) {
    try {
      await remove(f.path);
      n++;
    } catch (e) {
      console.warn("archive delete failed", f.name, e);
    }
  }
  return n;
}
