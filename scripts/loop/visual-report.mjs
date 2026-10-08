#!/usr/bin/env node
// capz-loop L4: turn a folder of visual-check screenshots into a Markdown
// report served by md-server, and print its URL for the PR comment.
//
// GitHub's API cannot attach images to a comment and capz is a public repo, so
// screenshots never get committed — they live under ~/development/_scratch,
// which md-server (Tailscale only) renders.
//
// Usage: node scripts/loop/visual-report.mjs <screenshot-dir> <pr-number> [title]
import { copyFileSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const [src, pr, title = `PR #${pr} visual check`] = process.argv.slice(2);
if (!src || !/^\d+$/.test(pr ?? "")) {
  console.error("usage: visual-report.mjs <screenshot-dir> <pr-number> [title]");
  process.exit(1);
}

const DEV = join(homedir(), "development");
const rel = join("_scratch", "capz-loop", `pr-${pr}`);
const dest = join(DEV, rel);
const base = process.env.MD_SERVER_URL ?? "http://wadjakorn-bmax:8080";

const shots = readdirSync(src).filter((f) => f.endsWith(".png")).sort();
if (shots.length === 0) {
  console.error(`no .png files in ${src}`);
  process.exit(1);
}

mkdirSync(dest, { recursive: true });
const lines = [`# ${title}`, "", `Generated ${new Date().toISOString()} by capz-loop (L4, /paste in headless Chrome).`, ""];
for (const f of shots) {
  copyFileSync(join(src, f), join(dest, f));
  const caption = f.replace(/\.png$/, "").replace(/^\d+-/, "").replace(/-/g, " ");
  lines.push(`## ${caption}`, "", `![${caption}](${f})`, "");
}
writeFileSync(join(dest, "report.md"), lines.join("\n"));
console.log(`${base}/${rel}/report.md`);
