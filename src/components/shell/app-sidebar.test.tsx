import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { SidebarProvider } from "@/components/ui/sidebar";
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

describe("AppSidebar", () => {
  test("renders nav, slots and user", () => {
    render(
      <ThemeProvider>
        <SidebarProvider>
          <AppSidebar
            collapsible="none"
            user={{ name: "Ada Lovelace", plan: "Pay as you go" }}
            recent={<p>recent slot</p>}
            credits={<p>credits slot</p>}
          />
        </SidebarProvider>
      </ThemeProvider>,
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
    expect(screen.getByRole("button", { name: "Search" })).toBeEnabled();
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
  });
});

describe("AppSidebar collapsed to icons", () => {
  test("the logo expands it again", async () => {
    render(
      <ThemeProvider>
        <SidebarProvider defaultOpen={false}>
          <AppSidebar
            collapsible="icon"
            user={{ name: "Ada Lovelace", plan: "Pay as you go" }}
            recent={<p>recent slot</p>}
            credits={<p>credits slot</p>}
          />
        </SidebarProvider>
      </ThemeProvider>,
    );
    const sidebar = document.querySelector("[data-slot=sidebar][data-state]")!;
    expect(sidebar).toHaveAttribute("data-state", "collapsed");
    expect(sidebar).toHaveAttribute("data-collapsible", "icon");
    fireEvent.click(screen.getByRole("button", { name: "Expand sidebar" }));
    expect(sidebar).toHaveAttribute("data-state", "expanded");
  });
});
