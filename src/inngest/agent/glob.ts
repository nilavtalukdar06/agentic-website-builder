const SPECIAL = /[.+^${}()|[\]\\]/g;

export function globToRegExp(glob: string) {
  const pattern = glob.trim().replace(/^\.\/+/, "") || "**";
  let source = "";
  for (let index = 0; index < pattern.length; index++) {
    const char = pattern[index];
    if (char === "*") {
      if (pattern[index + 1] === "*") {
        const slash = pattern[index + 2] === "/";
        source += slash ? "(?:.*/)?" : ".*";
        index += slash ? 2 : 1;
      } else {
        source += "[^/]*";
      }
    } else if (char === "?") {
      source += "[^/]";
    } else {
      source += char.replace(SPECIAL, "\\$&");
    }
  }
  return new RegExp(`^${source}$`);
}

export function matchesGlob(path: string, glob: string) {
  const pattern = glob.trim();
  if (!pattern || pattern === "**" || pattern === "**/*") return true;
  if (!/[*?]/.test(pattern)) {
    const prefix = pattern.replace(/^\.\/+/, "").replace(/\/+$/, "");
    return path === prefix || path.startsWith(`${prefix}/`);
  }
  return globToRegExp(pattern).test(path);
}

export function shellQuote(value: string) {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
