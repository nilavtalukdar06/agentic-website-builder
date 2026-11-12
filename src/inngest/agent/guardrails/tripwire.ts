const checks: { reason: string; test: (content: string) => boolean }[] = [
  {
    reason: "it runs remote or encoded code with eval or new Function",
    test: (content) =>
      /\beval\s*\(\s*(await\s+)?(fetch|atob|Buffer\.from|unescape|decodeURIComponent)\b/.test(
        content,
      ) ||
      /\bnew\s+Function\s*\([^)]*\b(atob|fetch|Buffer\.from|response|await)\b/.test(
        content,
      ),
  },
  {
    reason: "it sends document.cookie to another site",
    test: (content) =>
      /document\.cookie/.test(content) &&
      /(fetch|sendBeacon|XMLHttpRequest|new\s+Image)[\s\S]{0,400}https?:\/\//.test(
        content,
      ) &&
      /https?:\/\/[^\s'"`]+[\s\S]{0,400}document\.cookie|document\.cookie[\s\S]{0,400}https?:\/\//.test(
        content,
      ),
  },
  {
    reason: "it looks like a cryptocurrency miner",
    test: (content) =>
      /\b(coinhive|coin-hive|cryptonight|xmrig|coinimp|crypto-loot|webminepool|minero\.cc)\b/i.test(
        content,
      ),
  },
  {
    reason: "it looks like a wallet drainer",
    test: (content) =>
      /\b(inferno|angel|pink|monkey|venom)\s*drainer\b/i.test(content) ||
      /setApprovalForAll\s*\(\s*["'`]0x[0-9a-fA-F]{40}["'`]\s*,\s*true/.test(
        content,
      ),
  },
];

export function codeTripwire(content: string) {
  return checks.find((check) => check.test(content))?.reason ?? null;
}
