#!/usr/bin/env node
// Bump version across package.json, src-tauri/tauri.conf.json, src-tauri/Cargo.toml.
// Commits + tags. Does NOT push.
//
// Usage:
//   pnpm release patch|minor|major|<x.y.z> [--dry-run] [--no-commit] [--no-tag]

import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PKG = resolve(ROOT, "package.json");
const TAURI = resolve(ROOT, "src-tauri/tauri.conf.json");
const CARGO = resolve(ROOT, "src-tauri/Cargo.toml");

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const bumpArg = args.find((a) => !a.startsWith("--"));
const dryRun = flags.has("--dry-run");
const noCommit = flags.has("--no-commit");
const noTag = flags.has("--no-tag");

if (!bumpArg) {
  console.error("usage: pnpm release patch|minor|major|<x.y.z> [--dry-run] [--no-commit] [--no-tag]");
  process.exit(1);
}

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

function nextVersion(current, kind) {
  const m = current.match(SEMVER);
  if (!m) throw new Error(`current version not semver: ${current}`);
  let [_, maj, min, pat] = m.map(Number);
  if (kind === "patch") pat += 1;
  else if (kind === "minor") { min += 1; pat = 0; }
  else if (kind === "major") { maj += 1; min = 0; pat = 0; }
  else if (SEMVER.test(kind)) return kind;
  else throw new Error(`unknown bump: ${kind}`);
  return `${maj}.${min}.${pat}`;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJsonInPlace(path, mut) {
  const raw = readFileSync(path, "utf8");
  const obj = JSON.parse(raw);
  mut(obj);
  const trailingNl = raw.endsWith("\n") ? "\n" : "";
  writeFileSync(path, JSON.stringify(obj, null, 2) + trailingNl);
}

function bumpCargoPackageVersion(path, next) {
  const raw = readFileSync(path, "utf8");
  let inPackage = false;
  let replaced = false;
  const out = raw.split("\n").map((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("[")) inPackage = trimmed === "[package]";
    if (inPackage && !replaced && /^version\s*=\s*"/.test(line)) {
      replaced = true;
      return line.replace(/"[^"]*"/, `"${next}"`);
    }
    return line;
  }).join("\n");
  if (!replaced) throw new Error(`could not find [package] version in ${path}`);
  writeFileSync(path, out);
}

function sh(cmd) {
  if (dryRun) { console.log(`+ ${cmd}`); return ""; }
  return execSync(cmd, { cwd: ROOT, stdio: "inherit" });
}

const pkg = readJson(PKG);
const tauri = readJson(TAURI);

if (pkg.version !== tauri.version) {
  console.warn(`warn: package.json (${pkg.version}) and tauri.conf.json (${tauri.version}) differ — using package.json as source of truth`);
}

const current = pkg.version;
const next = nextVersion(current, bumpArg);
const tag = `v${next}`;

console.log(`current: ${current}`);
console.log(`next:    ${next}`);
console.log(`tag:     ${tag}`);
if (dryRun) console.log("(dry run — no files changed, no git ops)");

if (!dryRun) {
  writeJsonInPlace(PKG, (o) => { o.version = next; });
  writeJsonInPlace(TAURI, (o) => { o.version = next; });
  bumpCargoPackageVersion(CARGO, next);
}

// Check working tree only has expected files dirty.
let status = "";
try {
  status = execSync("git status --porcelain", { cwd: ROOT }).toString();
} catch {}
const expected = new Set(["package.json", "src-tauri/tauri.conf.json", "src-tauri/Cargo.toml"]);
const dirty = status.split("\n").map((l) => l.slice(3).trim()).filter(Boolean);
const unexpected = dirty.filter((f) => !expected.has(f));
if (unexpected.length > 0) {
  console.error(`refusing to commit — unexpected dirty files:\n  ${unexpected.join("\n  ")}`);
  console.error("stash or commit them first, or re-run with --no-commit");
  process.exit(2);
}

if (!noCommit) {
  sh(`git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml`);
  sh(`git commit -m "chore(release): ${tag}"`);
  if (!noTag) sh(`git tag ${tag}`);
}

console.log("done. push with: git push && git push --tags");
