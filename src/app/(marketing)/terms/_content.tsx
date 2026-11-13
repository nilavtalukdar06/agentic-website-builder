import {
  A,
  type ArticleSection,
  P,
  Strong,
  UL,
} from "@/components/marketing/prose";
import { CONTACT_EMAIL } from "@/lib/contact";

export const termsSections: ArticleSection[] = [
  {
    id: "agreement",
    title: "1. Agreement",
    body: (
      <>
        <P>
          These Terms govern your use of Vibe, an AI website builder operated by
          Nilav Talukdar (&quot;we&quot;, &quot;us&quot;). By signing in or
          using Vibe you agree to these Terms and to our{" "}
          <A href="/privacy">Privacy Policy</A>. If you don&apos;t agree,
          don&apos;t use Vibe.
        </P>
        <P>
          You must be at least 18 years old, or the age of majority where you
          live, to use Vibe.
        </P>
      </>
    ),
  },
  {
    id: "service",
    title: "2. What Vibe does",
    body: (
      <>
        <P>
          You describe a website in plain language. An AI agent writes a Next.js
          project in a temporary cloud sandbox while you watch. You can preview
          the result, read the code, download it, or export it to a GitHub
          repository you own.
        </P>
        <P>
          Vibe is under active development. We may add, change or remove
          features, and features marked &quot;coming soon&quot; may not be
          available yet.
        </P>
      </>
    ),
  },
  {
    id: "account",
    title: "3. Your account",
    body: (
      <>
        <P>
          You sign in with GitHub. We read your GitHub profile and email to
          create your account. You are responsible for activity under your
          account and for keeping your GitHub credentials secure. Tell us
          straight away if you think someone else has accessed your account.
        </P>
        <P>
          One person, one account. Don&apos;t share an account or create
          accounts to get around limits.
        </P>
      </>
    ),
  },
  {
    id: "content",
    title: "4. Your content and generated code",
    body: (
      <>
        <P>
          <Strong>You own your prompts and the projects you create.</Strong> As
          between you and us, you own the code Vibe generates for you, to the
          extent the law allows ownership of AI-generated output. We claim no
          ownership of it.
        </P>
        <P>
          You give us a limited licence to host, process and display your
          prompts, messages and project files, and to send them to the service
          providers listed in the Privacy Policy, only to run Vibe for you.
        </P>
        <P>
          AI output can be wrong, incomplete, insecure or similar to output
          generated for other people. Review generated code before you rely on
          it, ship it, or use it for anything important. You are responsible for
          how you use it, including checking that it doesn&apos;t infringe
          anyone&apos;s rights.
        </P>
        <P>
          <Strong>Keys and services you use.</Strong> Vibe doesn&apos;t store
          API keys, tokens or database connection strings, and the agent
          won&apos;t ask for them. If you add one to your exported project
          yourself, you are responsible for it: that you are allowed to use it,
          the costs it runs up with its provider, and the data it reaches.
          Preview links are not private, so anyone with a preview link can open
          the app.
        </P>
      </>
    ),
  },
  {
    id: "acceptable-use",
    title: "5. Acceptable use",
    body: (
      <>
        <P>Don&apos;t use Vibe to:</P>
        <UL>
          <li>
            build anything illegal, fraudulent, deceptive or that infringes
            someone else&apos;s rights, including phishing or impersonation
            sites;
          </li>
          <li>
            create malware, or content that is hateful, harassing, sexually
            explicit involving minors, or that promotes violence;
          </li>
          <li>
            attack, probe or overload Vibe, its sandboxes or other people&apos;s
            systems, or use sandboxes for crypto mining or unrelated compute;
          </li>
          <li>
            bypass credit metering, rate limits or access controls, or resell
            access to Vibe;
          </li>
          <li>
            put personal data of other people or regulated data (health, payment
            card or similar) in prompts or projects, or paste secrets into
            prompts;
          </li>
          <li>
            get around Vibe&apos;s safety checks, for example by hiding
            instructions for the agent in files, pages or packages.
          </li>
        </UL>
        <P>
          Vibe checks prompts, replies and generated code automatically and may
          refuse a request that looks harmful; refused requests are not charged.
          We may also stop a run, remove content or suspend an account that
          breaks these rules.
        </P>
      </>
    ),
  },
  {
    id: "credits",
    title: "6. Credits and payments",
    body: (
      <>
        <UL>
          <li>
            Vibe is pay as you go. You top up credits with a one-time payment
            between $5 and $100 (USD). The current rate is shown in the app
            before you pay.
          </li>
          <li>
            Credits are deducted as the agent works, based on the usage of each
            step. The balance and every deduction are shown on the Usage &amp;
            credits page.
          </li>
          <li>
            Payments are processed by our payment provider. We never see or
            store your full card details.
          </li>
          <li>
            Credits have no cash value and can&apos;t be transferred. Except
            where the law requires otherwise, payments are non-refundable once
            credits have been added.
          </li>
          <li>
            If a run fails because of a fault on our side, or you were charged
            by mistake, <A href={`mailto:${CONTACT_EMAIL}`}>contact us</A> and
            we will review a refund or a credit adjustment.
          </li>
          <li>
            We may change pricing or the credit rate. Changes apply to future
            top-ups and usage, not to credits you have already bought.
          </li>
        </UL>
      </>
    ),
  },
  {
    id: "github",
    title: "7. Exporting to GitHub",
    body: (
      <>
        <P>
          When you export, you authorise Vibe to access GitHub on your behalf to
          create or update the repository you choose and push your project to
          it. We ask for repository access only at that point. You can revoke it
          at any time in your GitHub settings under Applications. Once your code
          is in your repository, it is governed by GitHub&apos;s terms and your
          repository settings, not ours.
        </P>
      </>
    ),
  },
  {
    id: "third-parties",
    title: "8. Third-party services",
    body: (
      <P>
        Vibe depends on third parties for sign-in, hosting, the database, AI
        models, sandboxes and payments (see the{" "}
        <A href="/privacy#sharing">Privacy Policy</A>). Their own terms apply to
        their services, and we are not responsible for their outages or actions.
        Projects you generate may use open-source packages under their own
        licences.
      </P>
    ),
  },
  {
    id: "availability",
    title: "9. Availability and sandboxes",
    body: (
      <>
        <P>
          We aim to keep Vibe running but don&apos;t promise it will always be
          available or error-free.
        </P>
        <P>
          Sandboxes are paused when idle and resumed when you come back. A
          paused sandbox can still be lost, in which case it is recreated from
          your latest saved version. Download or export anything you can&apos;t
          afford to lose.
        </P>
      </>
    ),
  },
  {
    id: "termination",
    title: "10. Ending your use of Vibe",
    body: (
      <>
        <P>
          You can stop using Vibe at any time. To delete your account and
          project data, email{" "}
          <A href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</A>.
        </P>
        <P>
          We may suspend or end your access if you break these Terms, if
          required by law, or if we discontinue Vibe. Where we discontinue the
          service, we will give you reasonable notice to export your projects.
        </P>
      </>
    ),
  },
  {
    id: "disclaimers",
    title: "11. Disclaimers",
    body: (
      <P>
        Vibe is provided &quot;as is&quot; and &quot;as available&quot;. To the
        fullest extent the law allows, we disclaim all warranties, express or
        implied, including merchantability, fitness for a particular purpose,
        and non-infringement. We don&apos;t warrant that generated code will be
        correct, secure or suitable for your purpose.
      </P>
    ),
  },
  {
    id: "liability",
    title: "12. Limit of liability",
    body: (
      <P>
        To the fullest extent the law allows, we are not liable for indirect,
        incidental, special or consequential damages, or for lost profits, data
        or goodwill. Our total liability for any claim relating to Vibe is
        limited to the amount you paid us in the three months before the claim
        arose. Nothing in these Terms limits liability that can&apos;t be
        limited by law.
      </P>
    ),
  },
  {
    id: "changes",
    title: "13. Changes to these Terms",
    body: (
      <P>
        We may update these Terms. If a change is material we will tell you in
        the app or by email before it takes effect. Using Vibe after the change
        means you accept it. The date at the top of this page shows the latest
        version.
      </P>
    ),
  },
  {
    id: "law",
    title: "14. Governing law",
    body: (
      <P>
        These Terms are governed by the laws of India. Courts in India have
        jurisdiction over any dispute, unless mandatory consumer law where you
        live says otherwise.
      </P>
    ),
  },
  {
    id: "contact",
    title: "15. Contact",
    body: (
      <P>
        Questions about these Terms:{" "}
        <A href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</A>.
      </P>
    ),
  },
];
