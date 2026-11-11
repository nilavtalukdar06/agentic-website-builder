import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { SidebarProvider } from "@/components/ui/sidebar";
import { breadcrumbsFor } from "./app-header";
import { AppSidebar, isNavActive } from "./app-sidebar";

vi.mock("next/navigation", () => ({
  usePathname: () => "/projects",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/lib/auth-client", () => ({ authClient: { signOut: vi.fn() } }));

describe("isNavActive", () => {
  test.each([
    ["/", "/", true],
    ["/", "/projects", false],
    ["/projects", "/projects", true],
    ["/projects", "/projects/x", true],
    ["/projects", "/projectsx", false],
  ])("%s on %s → %s", (href, pathname, active) => {
    expect(isNavActive(href, pathname)).toBe(active);
  });
});

describe("breadcrumbsFor", () => {
  test("home only on /", () => {
    expect(breadcrumbsFor("/")).toEqual([{ title: "Home", href: "/" }]);
  });

  test("adds the section", () => {
    expect(breadcrumbsFor("/projects").map((c) => c.title)).toEqual([
      "Home",
      "Projects",
    ]);
    expect(breadcrumbsFor("/usage").map((c) => c.title)).toEqual([
      "Home",
      "Usage & credits",
    ]);
  });
});

describe("AppSidebar", () => {
  test("renders nav, slots and user", () => {
    render(
      <SidebarProvider>
        <AppSidebar
          collapsible="none"
          workspaceName="Personal workspace"
          user={{ name: "Ada Lovelace", plan: "Pay as you go" }}
          recent={<p>recent slot</p>}
          credits={<p>credits slot</p>}
        />
      </SidebarProvider>,
    );
    expect(screen.getByRole("link", { name: "Projects" })).toHaveAttribute(
      "data-active",
    );
    expect(screen.getByRole("link", { name: "Home" })).not.toHaveAttribute(
      "data-active",
    );
    expect(screen.queryByRole("link", { name: /Templates/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Templates" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(screen.getByText("Soon")).toBeInTheDocument();
    expect(screen.getByText("recent slot")).toBeInTheDocument();
    expect(screen.getByText("credits slot")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New project" })).toBeEnabled();
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
  });
});
