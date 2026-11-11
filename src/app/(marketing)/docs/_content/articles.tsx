import {
  CircleHelpIcon,
  CoinsIcon,
  FolderIcon,
  RocketIcon,
  WrenchIcon,
} from "lucide-react";
import type { ComponentType } from "react";
import { GithubIcon } from "@/components/icons/github-icon";
import {
  A,
  type ArticleSection,
  Code,
  Note,
  OL,
  P,
  Strong,
  UL,
} from "@/components/marketing/prose";
import { CONTACT_EMAIL } from "@/lib/contact";

export type DocArticle = {
  slug: string;
  title: string;
  description: string;
  icon: ComponentType<React.ComponentProps<"svg">>;
  sections: ArticleSection[];
};

export const docArticles: DocArticle[] = [
  {
    slug: "getting-started",
    title: "Getting started",
    description: "Sign in, describe a website and watch it get built.",
    icon: RocketIcon,
    sections: [
      {
        id: "sign-in",
        title: "Sign in",
        body: (
          <>
            <P>
              Vibe uses GitHub to sign you in. Choose{" "}
              <Strong>Continue with GitHub</Strong> on the sign-in page and
              approve the request. Vibe reads only your GitHub profile and email
              at this point. Repository access is requested later, if you decide
              to export a project.
            </P>
          </>
        ),
      },
      {
        id: "create",
        title: "Describe your website",
        body: (
          <>
            <P>
              On Home, write what you want in the prompt box. Be specific about
              the purpose, the content and the feel.
            </P>
            <UL>
              <li>
                &quot;A landing page for Ember &amp; Oak, a small coffee
                roastery. Warm and editorial, with a menu and an order
                form.&quot;
              </li>
              <li>
                &quot;A pricing page for a project management tool with three
                tiers and a monthly/yearly toggle.&quot;
              </li>
            </UL>
            <P>
              Press <Strong>Create project</Strong>. Vibe names the project from
              your prompt and opens it.
            </P>
          </>
        ),
      },
      {
        id: "build",
        title: "Watch it build",
        body: (
          <>
            <P>
              An agent writes the code in a fresh Next.js sandbox. The chat on
              the left shows what it is doing, and the right side switches
              between <Strong>Preview</Strong> (the running site) and{" "}
              <Strong>Code</Strong> (every file it wrote).
            </P>
            <Note title="Coming soon">
              <P>
                The live workspace is being built. Right now a new project opens
                a page that shows its prompt while it waits for the agent.
              </P>
            </Note>
          </>
        ),
      },
      {
        id: "next",
        title: "What next",
        body: (
          <UL>
            <li>
              Ask for changes in the chat. Each change is saved as a new
              version.
            </li>
            <li>
              Read how it works in{" "}
              <A href="/docs/how-vibe-builds">How Vibe builds your site</A>.
            </li>
            <li>
              Learn how credits are used in{" "}
              <A href="/docs/credits-and-billing">Credits &amp; billing</A>.
            </li>
          </UL>
        ),
      },
    ],
  },
  {
    slug: "how-vibe-builds",
    title: "How Vibe builds your site",
    description: "What happens between your prompt and a running website.",
    icon: WrenchIcon,
    sections: [
      {
        id: "sandbox",
        title: "A sandbox per project",
        body: (
          <P>
            Every project gets its own isolated cloud sandbox with Node, a
            Next.js app, Tailwind CSS and shadcn/ui already installed, so the
            dev server starts almost immediately. Nothing runs on your machine.
          </P>
        ),
      },
      {
        id: "agent",
        title: "The agent",
        body: (
          <>
            <P>The agent works in a loop. It can:</P>
            <OL>
              <li>Run terminal commands in the sandbox, such as installs.</li>
              <li>Create and update files.</li>
              <li>Read files back to check its own work.</li>
            </OL>
            <P>
              It stops when it has finished and written a summary, or when it
              reaches its step limit. You see each step as it happens.
            </P>
          </>
        ),
      },
      {
        id: "output",
        title: "What you get",
        body: (
          <UL>
            <li>A standard Next.js App Router project you can run anywhere.</li>
            <li>Tailwind CSS styling and shadcn/ui components.</li>
            <li>
              A saved version after every run, so you can go back to an earlier
              state.
            </li>
          </UL>
        ),
      },
      {
        id: "limits",
        title: "Good to know",
        body: (
          <UL>
            <li>
              AI output can contain mistakes. Check the code before shipping it.
            </li>
            <li>
              Sandboxes are temporary. After a while idle, a sandbox is
              recreated from your latest version when you open the project.
            </li>
            <li>
              Preview addresses aren&apos;t secret. Never put API keys or
              passwords in a prompt or a project.
            </li>
          </UL>
        ),
      },
    ],
  },
  {
    slug: "projects",
    title: "Projects",
    description: "Find, open and organise what you have built.",
    icon: FolderIcon,
    sections: [
      {
        id: "home",
        title: "Home and recent projects",
        body: (
          <P>
            Home shows your six most recently edited projects, and the sidebar
            keeps the last four one click away. Select any of them to open it.
          </P>
        ),
      },
      {
        id: "all-projects",
        title: "The Projects page",
        body: (
          <>
            <UL>
              <li>
                <Strong>Search</Strong> by name, slug or description.
              </li>
              <li>
                <Strong>Filter</Strong> by All, On GitHub or Not exported.
              </li>
              <li>
                <Strong>Sort</Strong> by last edited, name or created date.
              </li>
            </UL>
            <P>
              Filters live in the address bar, so you can bookmark or share a
              filtered view.
            </P>
          </>
        ),
      },
      {
        id: "shortcuts",
        title: "Keyboard shortcuts",
        body: (
          <P>
            Press <Code>⌘K</Code> (or <Code>Ctrl K</Code>) anywhere in the app
            to open the command menu. Search your projects, start a new one or
            jump to a page.
          </P>
        ),
      },
      {
        id: "names",
        title: "Names and slugs",
        body: (
          <P>
            Vibe turns your prompt into a short project name and a URL-safe
            slug. If the slug is already taken, a short suffix is added so every
            project address stays unique.
          </P>
        ),
      },
    ],
  },
  {
    slug: "credits-and-billing",
    title: "Credits & billing",
    description: "How usage is metered and how to top up.",
    icon: CoinsIcon,
    sections: [
      {
        id: "how-it-works",
        title: "How credits work",
        body: (
          <>
            <P>
              Vibe is pay as you go. Every agent step uses credits, and your
              balance is always visible in the sidebar. There is no
              subscription.
            </P>
          </>
        ),
      },
      {
        id: "top-up",
        title: "Topping up",
        body: (
          <>
            <UL>
              <li>One-time payments from $5 to $100 (USD).</li>
              <li>Pick a preset amount or choose your own.</li>
              <li>The rate is $1 = 100 credits.</li>
              <li>Credits are added as soon as the payment clears.</li>
            </UL>
            <Note title="Coming soon">
              <P>
                Payments are not switched on yet. The Usage &amp; credits page
                will show your balance, daily usage and every charge.
              </P>
            </Note>
          </>
        ),
      },
      {
        id: "running-out",
        title: "Running out of credits",
        body: (
          <P>
            When your balance reaches zero, new runs are blocked until you top
            up. Your projects and code are never deleted for lack of credits.
          </P>
        ),
      },
      {
        id: "refunds",
        title: "Refunds and mistakes",
        body: (
          <P>
            If a run failed on our side or you were charged by mistake, email{" "}
            <A href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</A>. See the{" "}
            <A href="/terms#credits">Terms</A> for details.
          </P>
        ),
      },
    ],
  },
  {
    slug: "export-to-github",
    title: "Export to GitHub",
    description: "Push a project to a repository you own.",
    icon: GithubIcon,
    sections: [
      {
        id: "access",
        title: "Access",
        body: (
          <P>
            Signing in only reads your profile and email. The first time you
            export, GitHub asks you to approve repository access. You can revoke
            it any time in GitHub under Settings → Applications.
          </P>
        ),
      },
      {
        id: "export",
        title: "Exporting",
        body: (
          <>
            <OL>
              <li>Open a project and choose Export to GitHub.</li>
              <li>
                Pick a repository name (it starts as your project slug) and
                whether it is public or private.
              </li>
              <li>
                Vibe creates the repository and pushes your code as one commit.
              </li>
            </OL>
            <P>
              <Code>node_modules</Code>, <Code>.next</Code> and{" "}
              <Code>.env</Code> files are left out, and a README and{" "}
              <Code>.gitignore</Code> are added.
            </P>
          </>
        ),
      },
      {
        id: "run-locally",
        title: "Run it locally",
        body: (
          <>
            <P>Clone the repository and start it like any Next.js app:</P>
            <pre className="overflow-x-auto rounded-lg border bg-card p-3 font-mono text-xs text-foreground">
              {`git clone <your-repo-url>\ncd <your-repo>\nnpm install\nnpm run dev`}
            </pre>
          </>
        ),
      },
      {
        id: "again",
        title: "Exporting again",
        body: (
          <>
            <P>
              Exporting again pushes a new commit to the same repository, and
              the project shows an <Strong>On GitHub</Strong> badge.
            </P>
            <Note title="Coming soon">
              <P>Export to GitHub is planned and not available yet.</P>
            </Note>
          </>
        ),
      },
    ],
  },
  {
    slug: "faq",
    title: "FAQ",
    description: "Short answers to common questions.",
    icon: CircleHelpIcon,
    sections: [
      {
        id: "own",
        title: "Who owns the code?",
        body: (
          <P>
            You do. See section 4 of the <A href="/terms#content">Terms</A>.
          </P>
        ),
      },
      {
        id: "frameworks",
        title: "Which frameworks can it build?",
        body: (
          <P>
            Next.js with Tailwind CSS and shadcn/ui. It is the only template for
            now.
          </P>
        ),
      },
      {
        id: "data",
        title: "What happens to my prompts?",
        body: (
          <P>
            They are stored with your project and sent to the AI model and
            sandbox provider that build it. The{" "}
            <A href="/privacy#sharing">Privacy Policy</A> lists every provider.
          </P>
        ),
      },
      {
        id: "down",
        title: "Is Vibe down?",
        body: (
          <P>
            Check the <A href="/status">status page</A>. It shows uptime for
            every hour.
          </P>
        ),
      },
      {
        id: "help",
        title: "I need help",
        body: (
          <P>
            Email <A href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</A> or see{" "}
            <A href="/contact">Contact</A>.
          </P>
        ),
      },
    ],
  },
];

export function getDocArticle(slug: string) {
  return docArticles.find((article) => article.slug === slug);
}

export function getAdjacentArticles(slug: string) {
  const index = docArticles.findIndex((article) => article.slug === slug);
  return {
    previous: index > 0 ? docArticles[index - 1] : null,
    next:
      index >= 0 && index < docArticles.length - 1
        ? docArticles[index + 1]
        : null,
  };
}
