import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { ProjectCard } from "./project-card";

const project = {
  href: "/p/ember-oak-roasters",
  name: "Ember & Oak Roasters",
  slug: "ember-oak-roasters",
  description: "Editorial landing page for a coffee roaster.",
  editedLabel: "Edited 12 minutes ago",
};

describe("ProjectCard", () => {
  test("links to the project and shows its details", () => {
    render(<ProjectCard {...project} />);
    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      "/p/ember-oak-roasters",
    );
    expect(screen.getByText("Ember & Oak Roasters")).toBeInTheDocument();
    expect(screen.getByText("ember-oak-roasters")).toBeInTheDocument();
    expect(screen.getByText("Edited 12 minutes ago")).toBeInTheDocument();
    expect(screen.queryByText("On GitHub")).toBeNull();
  });

  test("shows the GitHub badge once exported", () => {
    render(<ProjectCard {...project} onGithub />);
    expect(screen.getByText("On GitHub")).toBeInTheDocument();
  });

  test("falls back when there is no description", () => {
    render(<ProjectCard {...project} description={null} />);
    expect(screen.getByText("No description yet.")).toBeInTheDocument();
  });
});
