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
        id: "model",
        title: "Choose a model",
        body: (
          <>
            <P>
              The model chip in the prompt box shows which AI model will build
              your site. Select it to open a searchable list of coding models
              from Anthropic, OpenAI, Google, Moonshot AI, Z.ai, DeepSeek,
              Alibaba and Mistral, grouped by provider and marked with its logo.
            </P>
            <UL>
              <li>
                Each model shows its price per million tokens (what it reads /
                what it writes). Pricier models cost more credits per run.
              </li>
              <li>
                An image icon means the model can look at images you attach.
              </li>
              <li>
                If you don&apos;t pick one, Vibe uses its default coding model.
              </li>
            </UL>
          </>
        ),
      },
      {
        id: "images",
        title: "Add reference images",
        body: (
          <>
            <P>
              Select the paperclip, or paste an image into the prompt box, to
              attach screenshots, mockups or a mood board. The agent uses them
              as a visual reference for layout, colors and style. Hover over an
              attached image to preview it, or remove it before you send.
            </P>
            <UL>
              <li>Up to 4 images per prompt.</li>
              <li>PNG, JPEG, WebP or GIF, up to 4 MB each.</li>
              <li>
                Only models with the image icon can read images. While images
                are attached, the others can&apos;t be selected.
              </li>
              <li>
                Images are references only: the agent can&apos;t copy them into
                your site&apos;s files.
              </li>
            </UL>
          </>
        ),
      },
      {
        id: "voice",
        title: "Dictate your prompt",
        body: (
          <>
            <P>
              Select the microphone in the prompt box and describe your site out
              loud. Your words appear in the box as you speak, after anything
              you have already typed. Select the microphone again to stop.
            </P>
            <UL>
              <li>
                Typing, sending the prompt or leaving the page also stops it, so
                it never overwrites your edits.
              </li>
              <li>
                Your browser needs to allow microphone access for Vibe. If it is
                blocked, you will see a message explaining how to allow it.
              </li>
              <li>
                Voice input works in Chrome, Edge and Safari. In browsers
                without speech recognition, such as Firefox, the microphone is
                turned off.
              </li>
              <li>
                Vibe never receives your audio. Your browser turns speech into
                text, and in some browsers its maker processes the audio to do
                that. See the <A href="/privacy#collect">Privacy Policy</A>.
              </li>
            </UL>
          </>
        ),
      },
      {
        id: "build",
        title: "Let the agent build it",
        body: (
          <>
            <P>
              As soon as the project is created, an agent starts writing the
              code in its own Next.js sandbox. A first version usually takes a
              few minutes.
            </P>
            <P>
              The project page shows{" "}
              <Strong>The agent is building your site</Strong> while it works.
              Select <Strong>Refresh</Strong> to check on it. When it finishes,
              the page shows the agent&apos;s summary of what it built and an{" "}
              <Strong>Open preview</Strong> button that opens the running site
              in a new tab.
            </P>
            <Note title="Coming soon">
              <P>
                A live workspace, with the agent&apos;s steps streaming in a
                chat and <Strong>Preview</Strong> and <Strong>Code</Strong>{" "}
                views of the site, replaces this page.
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
              Every finished run is saved as a version of your project. Asking
              for changes in a chat comes with the live workspace.
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
          <>
            <P>
              Every project gets its own isolated cloud sandbox with Node, a
              Next.js app (created with the shadcn CLI), Tailwind CSS and every
              shadcn/ui component already installed. The dev server is already
              running when the sandbox starts, so the preview is up as soon as
              the first files are written. Nothing runs on your machine.
            </P>
            <P>
              A sandbox stays up for 30 minutes after a run. After that, the
              next run starts a fresh sandbox and puts the files of your latest
              version back first, so the agent continues where it left off.
            </P>
          </>
        ),
      },
      {
        id: "agent",
        title: "The agent",
        body: (
          <>
            <P>
              The agent runs on the AI model you picked and works in a loop. It
              can:
            </P>
            <OL>
              <li>Run terminal commands in the sandbox, such as installs.</li>
              <li>Create and update files.</li>
              <li>Read files back to check its own work.</li>
            </OL>
            <P>
              It stops when it has finished and written a summary of what it
              built. To keep runs safe and predictable, it has limits:
            </P>
            <UL>
              <li>At most 30 steps per run.</li>
              <li>At most 80 changed files per run.</li>
              <li>
                It can only write inside the project, never to <Code>.env</Code>{" "}
                files, and it can&apos;t run commands such as <Code>sudo</Code>,
                restart the dev server or delete the whole project.
              </li>
            </UL>
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
              Light and dark themes that follow each visitor&apos;s system
              setting, unless your design is one fixed look. Ask for a fixed
              look in your prompt if you want one.
            </li>
            <li>
              A saved version after every run, with a short title, every source
              file and the credits it used. Restoring an earlier version is
              coming with the live workspace.
            </li>
          </UL>
        ),
      },
      {
        id: "failures",
        title: "If a run fails",
        body: (
          <>
            <P>
              If the agent hits an error it can&apos;t recover from, or runs out
              of steps before finishing, the project page says{" "}
              <Strong>The agent stopped</Strong> and explains why. Failed runs
              are not charged.
            </P>
            <P>
              If the model you picked isn&apos;t available at the moment, the
              run stops right away and asks you to pick another model. If the
              model is busy, the agent waits and continues on its own, so a run
              can take a little longer.
            </P>
          </>
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
              Sandboxes are temporary. After 30 minutes they shut down, and the
              next run recreates one from your latest version.
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
              Vibe is pay as you go. There is no subscription, and your balance
              is always visible in the sidebar.
            </P>
            <UL>
              <li>
                Each run is charged once, when it finishes, for what the AI
                model you picked actually cost: how much text (and how many
                images) it read and wrote, at that model&apos;s price. Bigger
                requests, longer runs and pricier models use more.
              </li>
              <li>
                The model list shows every model&apos;s price per million
                tokens, so you can pick a cheaper one for small changes.
              </li>
              <li>The amount is rounded up to the next whole credit.</li>
              <li>
                Failed runs are free. You are only charged for runs that save a
                version.
              </li>
              <li>The credits each run used are saved with its version.</li>
            </UL>
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
          <>
            <P>
              When your balance is zero or less, a new run doesn&apos;t start:
              the project page says you&apos;re out of credits, and nothing is
              charged.
            </P>
            <P>
              If your credits run out during a run, the agent stops after its
              current step, saves what it built as a version and charges for
              that work. Your balance can end slightly below zero. Your projects
              and code are never deleted for lack of credits.
            </P>
          </>
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
        id: "models",
        title: "Which AI model builds my site?",
        body: (
          <P>
            The one you pick in the prompt box. Vibe offers a hand-picked list
            of coding models from several providers. See{" "}
            <A href="/docs/getting-started#model">Choose a model</A>.
          </P>
        ),
      },
      {
        id: "data",
        title: "What happens to my prompts and images?",
        body: (
          <P>
            They are stored with your project, and attached images are kept in
            private storage. Both are sent to the AI model you picked and to the
            sandbox provider that builds your site. The{" "}
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
