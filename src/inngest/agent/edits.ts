export type EditBlock = { search: string; replace: string };

export type EditResult =
  | { ok: true; content: string; replacements: number }
  | { ok: false; error: string };

const CONTEXT_LINES = 3;

function lineStarts(lines: string[]) {
  const starts: number[] = [];
  let offset = 0;
  for (const line of lines) {
    starts.push(offset);
    offset += line.length + 1;
  }
  return starts;
}

function exactMatches(content: string, search: string) {
  const found: number[] = [];
  let from = 0;
  while (from <= content.length) {
    const index = content.indexOf(search, from);
    if (index === -1) break;
    found.push(index);
    from = index + 1;
  }
  return found;
}

function looseMatches(lines: string[], searchLines: string[]) {
  const wanted = searchLines.map((line) => line.trim());
  const found: number[] = [];
  for (let start = 0; start + wanted.length <= lines.length; start++) {
    if (wanted.every((line, offset) => lines[start + offset].trim() === line)) {
      found.push(start);
    }
  }
  return found;
}

function trimBlankEdges(lines: string[]) {
  let start = 0;
  let end = lines.length;
  while (start < end && !lines[start].trim()) start++;
  while (end > start && !lines[end - 1].trim()) end--;
  return lines.slice(start, end);
}

function lineNumberOf(content: string, index: number) {
  return content.slice(0, index).split("\n").length;
}

function excerpt(lines: string[], center: number) {
  const from = Math.max(0, center - CONTEXT_LINES);
  const to = Math.min(lines.length, center + CONTEXT_LINES + 1);
  return lines
    .slice(from, to)
    .map((line, offset) => `${from + offset + 1}| ${line}`)
    .join("\n");
}

function tokens(text: string) {
  return new Set(
    text.split(/[^A-Za-z0-9_$-]+/).filter((token) => token.length > 1),
  );
}

function closestLine(lines: string[], searchLines: string[]) {
  const probes = searchLines
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => ({ line, tokens: tokens(line) }));
  let best = -1;
  let bestScore = 0;
  for (const [index, line] of lines.entries()) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const own = tokens(trimmed);
    let score = 0;
    for (const probe of probes) {
      if (trimmed === probe.line) {
        score += 10;
        continue;
      }
      let shared = 0;
      for (const token of probe.tokens) if (own.has(token)) shared++;
      if (probe.tokens.size > 0 && shared / probe.tokens.size >= 0.5) {
        score += shared;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      best = index;
    }
  }
  return best;
}

function applyOne(
  content: string,
  block: EditBlock,
  position: number,
): { ok: true; content: string } | { ok: false; error: string } {
  if (!block.search) {
    return {
      ok: false,
      error: `Edit ${position}: search is empty. Copy the exact lines to change from the file, or use createOrUpdateFiles for a new file.`,
    };
  }

  const exact = exactMatches(content, block.search);
  if (exact.length === 1) {
    const at = exact[0];
    return {
      ok: true,
      content:
        content.slice(0, at) +
        block.replace +
        content.slice(at + block.search.length),
    };
  }
  if (exact.length > 1) {
    const where = exact
      .slice(0, 5)
      .map((index) => lineNumberOf(content, index))
      .join(", ");
    return {
      ok: false,
      error: `Edit ${position}: the search text appears ${exact.length} times (lines ${where}). Include more surrounding lines so it matches exactly once.`,
    };
  }

  const lines = content.split("\n");
  const searchLines = trimBlankEdges(block.search.split("\n"));
  if (searchLines.length > 0) {
    const loose = looseMatches(lines, searchLines);
    if (loose.length === 1) {
      const start = loose[0];
      const starts = lineStarts(lines);
      const from = starts[start];
      const lastLine = start + searchLines.length - 1;
      const to = starts[lastLine] + lines[lastLine].length;
      const replacement = trimBlankEdges(block.replace.split("\n")).join("\n");
      return {
        ok: true,
        content: content.slice(0, from) + replacement + content.slice(to),
      };
    }
    if (loose.length > 1) {
      return {
        ok: false,
        error: `Edit ${position}: the search text matches ${loose.length} places when whitespace is ignored (lines ${loose
          .slice(0, 5)
          .map((line) => line + 1)
          .join(
            ", ",
          )}). Include more surrounding lines so it matches exactly once.`,
      };
    }
  }

  const closest = closestLine(lines, searchLines);
  return {
    ok: false,
    error:
      closest === -1
        ? `Edit ${position}: the search text was not found. Read the file again and copy the lines exactly.`
        : `Edit ${position}: the search text was not found. The closest lines are:\n${excerpt(lines, closest)}\nCopy the lines exactly as they are in the file (without the line numbers).`,
  };
}

export function applyEdits(content: string, blocks: EditBlock[]): EditResult {
  const crlf = content.includes("\r\n");
  const normalize = (text: string) => text.replace(/\r\n/g, "\n");
  let working = normalize(content);

  for (const [index, block] of blocks.entries()) {
    const applied = applyOne(
      working,
      { search: normalize(block.search), replace: normalize(block.replace) },
      index + 1,
    );
    if (!applied.ok) {
      return {
        ok: false,
        error: `${applied.error}\nNo edits were applied to this file.`,
      };
    }
    working = applied.content;
  }

  return {
    ok: true,
    content: crlf ? working.replace(/\n/g, "\r\n") : working,
    replacements: blocks.length,
  };
}
