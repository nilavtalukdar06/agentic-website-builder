import {
  A,
  type ArticleSection,
  P,
  Strong,
  UL,
} from "@/components/marketing/prose";
import { CONTACT_EMAIL } from "@/lib/contact";

export const privacySections: ArticleSection[] = [
  {
    id: "who",
    title: "1. Who we are",
    body: (
      <P>
        Vibe is an AI website builder operated by Nilav Talukdar. This policy
        explains what personal data we collect when you use Vibe, why, and the
        choices you have. For anything here, write to{" "}
        <A href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</A>.
      </P>
    ),
  },
  {
    id: "collect",
    title: "2. What we collect",
    body: (
      <>
        <UL>
          <li>
            <Strong>Account.</Strong> From GitHub when you sign in: your name,
            email address, profile picture and GitHub account ID. We don&apos;t
            receive your GitHub password.
          </li>
          <li>
            <Strong>Sessions.</Strong> A session token, expiry time, IP address
            and browser user agent, so we can keep you signed in and protect
            your account.
          </li>
          <li>
            <Strong>Your projects.</Strong> Project names and slugs, your
            prompts and chat messages, the files the agent writes, saved
            versions, the preview address, and the linked GitHub repository
            after you export.
          </li>
          <li>
            <Strong>Credits and payments.</Strong> A ledger of credits added and
            used, and for each top-up the provider, reference, amount, currency
            and status. Card details are entered with our payment provider and
            never reach our servers.
          </li>
          <li>
            <Strong>Technical data.</Strong> Standard server logs from our
            hosting provider (such as IP address, requested page and errors),
            and the preference you pick for light or dark theme.
          </li>
        </UL>
        <P>
          We don&apos;t run advertising or cross-site tracking, and we
          don&apos;t currently use third-party analytics cookies.
        </P>
      </>
    ),
  },
  {
    id: "use",
    title: "3. How we use it",
    body: (
      <UL>
        <li>To sign you in and keep your account secure.</li>
        <li>
          To build what you ask for: running the agent, the sandbox and the
          preview, saving versions, and exporting to GitHub.
        </li>
        <li>To meter credits and process payments.</li>
        <li>
          To keep Vibe working: debugging, preventing abuse, and measuring
          availability on the <A href="/status">status page</A>. The health
          checks behind it contain no personal data.
        </li>
        <li>To reply when you contact us.</li>
      </UL>
    ),
  },
  {
    id: "sharing",
    title: "4. Who we share it with",
    body: (
      <>
        <P>
          We don&apos;t sell your data. We share it only with the service
          providers that run Vibe, and only as needed. Some apply only once you
          use the related feature, for example payments when you top up.
        </P>
        <UL>
          <li>
            <Strong>GitHub</Strong>: sign-in, and repository creation when you
            export.
          </li>
          <li>
            <Strong>Vercel</Strong>: hosting and serving the app.
          </li>
          <li>
            <Strong>Neon</Strong>: the PostgreSQL database that stores your
            account and projects.
          </li>
          <li>
            <Strong>OpenAI</Strong>: your prompts and the relevant project
            context are sent to the AI model that writes your code.
          </li>
          <li>
            <Strong>E2B</Strong>: runs the sandbox where your project is built
            and previewed. Your project code runs there.
          </li>
          <li>
            <Strong>Inngest</Strong>: runs the background jobs that drive the
            agent.
          </li>
          <li>
            <Strong>Stripe</Strong>: processes top-up payments.
          </li>
        </UL>
        <P>
          We may also disclose data if the law requires it, or to protect our
          rights, users or the service. If Vibe is ever transferred to another
          owner, we will tell you before your data is handed over.
        </P>
        <P>
          Don&apos;t put secrets or other people&apos;s personal data in
          prompts: they are sent to the providers above, and sandbox preview
          addresses are not secret.
        </P>
      </>
    ),
  },
  {
    id: "cookies",
    title: "5. Cookies and local storage",
    body: (
      <UL>
        <li>
          <Strong>Session cookie</Strong>: set when you sign in, needed to keep
          you signed in. Removed when you sign out or it expires.
        </li>
        <li>
          <Strong>Interface preferences</Strong>: your theme and whether the
          sidebar is open, kept in local storage or a cookie in your browser.
        </li>
      </UL>
    ),
  },
  {
    id: "retention",
    title: "6. How long we keep it",
    body: (
      <UL>
        <li>
          Account, project and credit data: for as long as your account exists.
          Payment and ledger records may be kept longer where we need them for
          accounting or legal reasons.
        </li>
        <li>Sessions: until they expire or you sign out.</li>
        <li>Uptime check records: 30 days.</li>
        <li>
          When you ask us to delete your account we remove your account and
          projects, except what we must keep by law.
        </li>
      </UL>
    ),
  },
  {
    id: "rights",
    title: "7. Your choices",
    body: (
      <>
        <P>
          You can ask us to give you a copy of your data, correct it, or delete
          it, and you can object to or restrict how we use it. Email{" "}
          <A href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</A> and we will
          reply within 30 days.
        </P>
        <UL>
          <li>
            Download or export your projects from the workspace whenever you
            like.
          </li>
          <li>
            Revoke Vibe&apos;s access in GitHub under Settings → Applications.
          </li>
          <li>Sign out to end your session on a device.</li>
        </UL>
      </>
    ),
  },
  {
    id: "security",
    title: "8. Security",
    body: (
      <P>
        We use encrypted connections, keep access keys on the server only, check
        project ownership on every request, and limit what each provider
        receives. No system is perfectly secure, so we can&apos;t guarantee
        absolute security. If a breach affects you we will tell you promptly.
      </P>
    ),
  },
  {
    id: "transfers",
    title: "9. Where data is processed",
    body: (
      <P>
        Our providers may process data in the United States and other countries.
        By using Vibe you understand your data may be transferred outside the
        country where you live.
      </P>
    ),
  },
  {
    id: "children",
    title: "10. Children",
    body: (
      <P>
        Vibe is not for anyone under 18. If you believe a child has signed up,
        email us and we will delete the account.
      </P>
    ),
  },
  {
    id: "changes",
    title: "11. Changes to this policy",
    body: (
      <P>
        If we change this policy in a material way we will tell you in the app
        or by email before the change takes effect. The date at the top shows
        the latest version. See also the <A href="/terms">Terms of Service</A>.
      </P>
    ),
  },
];
