// Pure helpers for scripts/release.mjs — string in, string out, so they can be
// unit-tested without touching the real files (see release-lib.test.mjs).

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

export function nextVersion(current, kind) {
  const m = current.match(SEMVER);
  if (!m) throw new Error(`current version not semver: ${current}`);
  let [, maj, min, pat] = m.map(Number);
  if (kind === "patch") pat += 1;
  else if (kind === "minor") { min += 1; pat = 0; }
  else if (kind === "major") { maj += 1; min = 0; pat = 0; }
  else if (SEMVER.test(kind)) return kind;
  else throw new Error(`unknown bump: ${kind}`);
  return `${maj}.${min}.${pat}`;
}

/** Visit each `key = "value"` line inside the sections `isTarget` accepts. */
function rewriteInSections(raw, isTarget, rewrite) {
  let header = "";
  let lines = [];
  return raw.split("\n").map((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("[")) { header = trimmed; lines = []; return line; }
    lines.push(trimmed);
    return isTarget(header, lines) ? rewrite(line) : line;
  }).join("\n");
}

export function cargoPackageName(toml) {
  let inPackage = false;
  for (const line of toml.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("[")) inPackage = trimmed === "[package]";
    const m = inPackage && trimmed.match(/^name\s*=\s*"([^"]+)"/);
    if (m) return m[1];
  }
  throw new Error("could not find [package] name in Cargo.toml");
}

export function bumpCargoTomlPackage(toml, next) {
  let replaced = false;
  const out = rewriteInSections(
    toml,
    (header) => header === "[package]",
    (line) => {
      if (replaced || !/^version\s*=\s*"/.test(line)) return line;
      replaced = true;
      return line.replace(/"[^"]*"/, `"${next}"`);
    },
  );
  if (!replaced) throw new Error("could not find [package] version in Cargo.toml");
  return out;
}

/**
 * Bump the `version` of the `[[package]]` entry named `name` in Cargo.lock.
 * Other entries keep their version even when it is the same string.
 */
export function bumpCargoLockPackage(lock, name, next) {
  let replaced = false;
  const out = rewriteInSections(
    lock,
    (header, lines) => header === "[[package]]" && lines[0] === `name = "${name}"`,
    (line) => {
      if (replaced || !/^version\s*=\s*"/.test(line)) return line;
      replaced = true;
      return line.replace(/"[^"]*"/, `"${next}"`);
    },
  );
  if (!replaced) throw new Error(`could not find package "${name}" in Cargo.lock`);
  return out;
}
