#!/usr/bin/env node
// Bump version across package.json, src-tauri/tauri.conf.json, src-tauri/Cargo.toml
// and the app's own entry in src-tauri/Cargo.lock.
// Commits + tags. Does NOT push.
//
// Usage:
//   pnpm release patch|minor|major|<x.y.z> [--dry-run] [--no-commit] [--no-tag]

import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  bumpCargoLockPackage,
  bumpCargoTomlPackage,
  cargoPackageName,
  nextVersion,
} from "./release-lib.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PKG = resolve(ROOT, "package.json");
const TAURI = resolve(ROOT, "src-tauri/tauri.conf.json");
const CARGO = resolve(ROOT, "src-tauri/Cargo.toml");
const CARGO_LOCK = resolve(ROOT, "src-tauri/Cargo.lock");

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
  const cargoToml = readFileSync(CARGO, "utf8");
  writeFileSync(CARGO, bumpCargoTomlPackage(cargoToml, next));
  const lock = readFileSync(CARGO_LOCK, "utf8");
  writeFileSync(CARGO_LOCK, bumpCargoLockPackage(lock, cargoPackageName(cargoToml), next));
}

// Check working tree only has expected files dirty.
let status = "";
try {
  status = execSync("git status --porcelain", { cwd: ROOT }).toString();
} catch {}
const expected = new Set([
  "package.json",
  "src-tauri/tauri.conf.json",
  "src-tauri/Cargo.toml",
  "src-tauri/Cargo.lock",
]);
const dirty = status.split("\n").map((l) => l.slice(3).trim()).filter(Boolean);
const unexpected = dirty.filter((f) => !expected.has(f));
if (unexpected.length > 0) {
  console.error(`refusing to commit — unexpected dirty files:\n  ${unexpected.join("\n  ")}`);
  console.error("stash or commit them first, or re-run with --no-commit");
  process.exit(2);
}

if (!noCommit) {
  sh(`git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock`);
  sh(`git commit -m "chore(release): ${tag}"`);
  if (!noTag) sh(`git tag ${tag}`);
}

console.log("done. push with: git push && git push --tags");
