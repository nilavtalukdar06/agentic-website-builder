import { expect, test } from "@playwright/test";

for (const theme of ["dark", "light"] as const) {
  for (const path of ["/sign-in", "/terms"]) {
    test(`${path} loads in ${theme} without flashing the other theme`, async ({
      page,
    }) => {
      const problems: string[] = [];
      page.on("console", (message) => {
        if (message.type() === "error") problems.push(message.text());
      });
      page.on("pageerror", (error) => problems.push(error.message));

      await page.addInitScript((value) => {
        localStorage.setItem("vibe-theme", value);
        const runs: string[] = [];
        (window as unknown as { __runs: string[] }).__runs = runs;
        document.addEventListener(
          "transitionrun",
          (event) => runs.push(event.propertyName),
          true,
        );
      }, theme);

      await page.goto(path);
      await expect(page.locator("html")).toHaveClass(
        theme === "light" ? /theme-light/ : /(^|\s)dark(\s|$)/,
      );
      await page.waitForTimeout(600);

      const runs = await page.evaluate(
        () => (window as unknown as { __runs: string[] }).__runs,
      );
      expect(runs).toEqual([]);
      expect(
        problems.filter((text) => !text.includes("Failed to load resource")),
      ).toEqual([]);
    });
  }
}

test("the theme is applied by a script that runs while the HTML is parsed", async ({
  request,
}) => {
  const html = await (await request.get("/sign-in")).text();
  expect(html).toContain('(function(){try{var k="vibe-theme"');
  expect(html).not.toContain("__next_s");
  const head = html.slice(html.indexOf("<head"), html.indexOf("</head>"));
  expect(head).toContain('var k="vibe-theme"');
});
