const { structuredPatch } = require('diff');

/**
 * Compares two file lists ({ path, content, hash }) and reports what changed.
 */
function summarize(prevFiles, nextFiles) {
  const prev = new Map(prevFiles.map((f) => [f.path, f]));
  const next = new Map(nextFiles.map((f) => [f.path, f]));
  const added = [];
  const removed = [];
  const modified = [];
  let unchanged = 0;

  for (const [p, file] of next) {
    const old = prev.get(p);
    if (!old) {
      added.push({ path: p, additions: lineCount(file.content), deletions: 0 });
    } else if (old.hash !== file.hash) {
      const { additions, deletions } = countChanges(old.content, file.content);
      modified.push({ path: p, additions, deletions });
    } else {
      unchanged++;
    }
  }
  for (const [p, file] of prev) {
    if (!next.has(p)) removed.push({ path: p, additions: 0, deletions: lineCount(file.content) });
  }
  return { added, removed, modified, unchanged };
}

function lineCount(s) {
  if (!s) return 0;
  return s.split('\n').length - (s.endsWith('\n') ? 1 : 0);
}

function countChanges(a, b) {
  const patch = structuredPatch('a', 'b', a, b, '', '', { context: 0 });
  let additions = 0;
  let deletions = 0;
  for (const h of patch.hunks) {
    for (const line of h.lines) {
      if (line[0] === '+') additions++;
      else if (line[0] === '-') deletions++;
    }
  }
  return { additions, deletions };
}

/** Full per-file hunks for the diff viewer. */
function fileDiffs(prevFiles, nextFiles) {
  const prev = new Map(prevFiles.map((f) => [f.path, f]));
  const next = new Map(nextFiles.map((f) => [f.path, f]));
  const paths = [...new Set([...prev.keys(), ...next.keys()])].sort();
  const out = [];
  for (const p of paths) {
    const a = prev.get(p);
    const b = next.get(p);
    if (a && b && a.hash === b.hash) continue;
    const status = !a ? 'added' : !b ? 'removed' : 'modified';
    const patch = structuredPatch(p, p, a ? a.content : '', b ? b.content : '', '', '', { context: 3 });
    out.push({ path: p, status, hunks: patch.hunks });
  }
  return out;
}

module.exports = { summarize, fileDiffs };
