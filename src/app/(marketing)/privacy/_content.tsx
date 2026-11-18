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
            prompts and chat messages, the AI model you chose for each message,
            the images you attach as references, the files the agent writes,
            saved versions, the preview address and the linked GitHub repository
            after you export. When you stop a request, we record when you
            stopped it.
          </li>
          <li>
            <Strong>GitHub exports.</Strong> Repository name and visibility, the
            saved version you selected, export progress, retry attempts, errors,
            repository address and commit identifier. GitHub OAuth credentials
            are encrypted in our account database and used only on our servers.
            They are never placed in your project sandbox.
          </li>
          <li>
            <Strong>Browser checks.</Strong> We collect page and interaction
            check results and desktop/phone screenshots of generated previews,
            which can contain content shown on your pages.
          </li>
          <li>
            <Strong>Email notifications.</Strong> Your email address (from your
            GitHub account), your on/off setting for notification emails, and
            daily totals of how many emails we sent. Each email names your
            project and says what happened (a build finished, failed or ran out
            of credits, or a GitHub export finished or failed). It never
            contains your prompts, code or files.
          </li>
          <li>
            <Strong>Memory.</Strong> When memory is on (the default), the text
            of the messages you send (with email addresses and phone numbers
            removed, and never messages that look like they contain a key) is
            stored with Supermemory, which turns it into short notes about your
            preferences and each project&apos;s decisions. Agent replies, files,
            websites and images are never saved to memory. We also keep your
            on/off setting and monthly memory usage totals, not their content.
          </li>
          <li>
            <Strong>Safety checks.</Strong> When a prompt, a reply or the
            agent&apos;s code is blocked or flagged, we record the time, the
            kind of check, the result and a one-way fingerprint (hash) of the
            text, not the text itself.
          </li>
          <li>
            <Strong>Voice input.</Strong> If you use the microphone button, your
            browser turns your speech into text. Depending on your browser, its
            maker processes the audio (for example Google for Chrome and
            Microsoft for Edge). Vibe never receives or stores the audio, only
            the text you choose to send as a prompt.
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
          <li>
            <Strong>Rate limits and reliability.</Strong> Short-lived counters
            of how often your account (or, for sign-in requests, your IP
            address) calls a limited action, so we can protect Vibe from abuse.
            We also record whether a project&apos;s preview resumed or had to be
            rebuilt (project ID and result only), and send technical alerts
            about failures, such as a payment that couldn&apos;t be credited, to
            a private channel run by the operator. Alerts contain technical
            references such as a payment-session ID, not your name or email.
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
        <li>
          To email you when a build finishes, fails or runs out of credits and
          when a GitHub export finishes or fails, unless you turn that off.
        </li>
        <li>
          To remember your preferences and earlier decisions, when memory is on,
          so you don&apos;t have to repeat them in every project.
        </li>
        <li>To meter credits and process payments.</li>
        <li>To keep Vibe working: debugging and preventing abuse.</li>
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
            export. Exporting sends your project files to GitHub. Public
            repositories can be read by anyone; private repositories follow
            GitHub&apos;s access controls. We request public repository access,
            or public and private repository access, when you connect for
            export.
          </li>
          <li>
            <Strong>Vercel</Strong>: hosting and serving the app.
          </li>
          <li>
            <Strong>Neon</Strong>: the PostgreSQL database that stores your
            account and projects, and the private storage that holds images you
            attach.
          </li>
          <li>
            <Strong>Vercel AI Gateway</Strong> and the AI provider of the model
            you pick (such as Anthropic, OpenAI, Google, Moonshot AI, Z.ai,
            DeepSeek, Alibaba or Mistral): your prompts, attached images and the
            relevant project context are sent to that model to write your code.
            Attached images reach it through links that expire after an hour.
            Your prompts and the agent&apos;s final replies are also checked by
            a safety model (OpenAI&apos;s gpt-oss-safeguard, through Vercel AI
            Gateway) to stop harmful requests such as phishing pages.
          </li>
          <li>
            <Strong>Parallel</Strong>, the web search provider, through Vercel
            AI Gateway: when your prompt names a website (an address such as
            example.com), the agent sends search queries about that site based
            on your prompt. Your account details and project code are not sent.
          </li>
          <li>
            <Strong>E2B</Strong>: runs the sandbox where your project is built
            and previewed. Your project code runs there. When a sandbox has been
            idle for a while, E2B pauses it and keeps its saved state (files and
            installed packages) until we resume or delete it.
          </li>
          <li>
            <Strong>Inngest</Strong>: runs the background jobs that drive the
            agent and GitHub exports. Export jobs process a scanned copy of
            project files and repository/commit metadata so interrupted work can
            resume. GitHub credentials are not included in job results or
            realtime messages.
          </li>
          <li>
            <Strong>Stripe</Strong>: processes top-up payments.
          </li>
          <li>
            <Strong>Browserbase</Strong>: runs cloud browsers that load your
            preview address and rendered page content for automated checks and a
            read-only live view. Stagehand sends page context through AI Gateway
            to the selected model. We disable session recording in our
            integration. Screenshots are stored in Neon Object Storage.
          </li>
          <li>
            <Strong>Resend</Strong>: sends the notification emails. It receives
            your email address, the project name and the outcome in each
            message, and keeps delivery records under its own retention policy.
          </li>
          <li>
            <Strong>Supermemory</Strong>: stores the text of your messages and
            the preference notes derived from them when memory is on, and
            searches them when the agent works on your projects.
          </li>
          <li>
            <Strong>Arcjet</Strong>: protects the app from abuse. It inspects
            request metadata (such as your IP address and headers) on every API
            route to block malicious traffic, bots and request floods, and
            screens your prompt for prompt-injection attempts before the agent
            acts on it. It does not receive your account details or project
            code.
          </li>
        </UL>
        <P>
          We may also disclose data if the law requires it, or to protect our
          rights, users or the service. If Vibe is ever transferred to another
          owner, we will tell you before your data is handed over.
        </P>
        <P>
          Don&apos;t put secrets or other people&apos;s personal data in
          prompts: prompts are sent to the providers above. If a prompt looks
          like it contains a key, Vibe rejects it before storing the message or
          sending it to an AI model, and asks you to send the request again
          without it. We do not store keys pasted into prompts. Sandbox preview
          addresses are not private: anyone with the link can open the preview.
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
        <li>
          Notification emails: we don&apos;t keep a copy of what we send. We
          keep your on/off setting while your account exists and daily send
          totals for operations. Resend&apos;s own delivery records follow its
          retention policy.
        </li>
        <li>
          Memory: until you forget it or clear it under Memory in your account
          menu, or delete the project it belongs to. Turning memory off stops
          Vibe from reading or adding to it but doesn&apos;t delete it.
          Supermemory&apos;s own operational records follow its retention
          policy.
        </li>
        <li>
          Browser screenshots: scheduled for deletion after 30 days, or when the
          project is deleted. Check results remain with the conversation.
          Provider operational records follow the provider&apos;s retention
          policies.
        </li>
        <li>
          Export records: for as long as the project exists. Deleting a project
          in Vibe does not delete its exported GitHub repository. You can revoke
          Vibe&apos;s GitHub access in your GitHub application settings.
        </li>
        <li>
          Deleting a project: when you delete a project in Vibe we permanently
          remove its messages, saved versions, export records, the images you
          attached to it, its sandbox and its project memory. We keep credit and
          payment records, and safety-check and resume records stay without a
          link to the project.
        </li>
        <li>
          Sandboxes: deleted automatically once a project has been idle for 14
          days, or when no project uses them any more. Your saved versions stay
          and the preview is rebuilt when you open the project.
        </li>
        <li>
          Images you attach but never send with a message: deleted after 24
          hours.
        </li>
        <li>
          Rate-limit counters: about a day. Preview resume records: 30 days.
        </li>
        <li>
          Safety-check records (fingerprints only): for as long as your account
          exists.
        </li>
        <li>
          When you ask us to delete your account we remove your account,
          projects and the images you attached, except what we must keep by law.
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
          <li>
            Turn notification emails off under Notifications in your account
            menu.
          </li>
          <li>
            Turn memory off, forget single items or clear all memory under
            Memory in your account menu, or say &ldquo;forget that…&rdquo; in
            any project.
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
        We use encrypted connections, keep access keys on the server only,
        remove keys and tokens we detect from everything the AI sees, check
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
