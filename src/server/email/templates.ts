import type { NotificationKind } from "./notify";

export type NotificationContent = {
  kind: NotificationKind;
  projectName: string;
  projectUrl: string;
  usageUrl: string;
  settingsUrl: string;
  repositoryUrl?: string | null;
};

const escape = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const LINE_BREAKS = new RegExp("[\\r\\n\\u2028\\u2029]+", "g");

const oneLine = (value: string) =>
  value.replace(LINE_BREAKS, " ").replace(/\s+/g, " ").trim().slice(0, 80);

const githubUrl = (value: string | null | undefined) =>
  value && /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/u.test(value)
    ? value
    : null;

type Copy = {
  subject: string;
  heading: string;
  body: string;
  action: string;
  href: string;
};

function copyFor(content: NotificationContent, name: string): Copy {
  switch (content.kind) {
    case "run-finished":
      return {
        subject: `${name} is ready`,
        heading: `${name} is ready`,
        body: "Vibe finished building your site. Open the project to see the preview and the changes.",
        action: "Open the project",
        href: content.projectUrl,
      };
    case "run-failed":
      return {
        subject: `Something went wrong building ${name}`,
        heading: "The build stopped with an error",
        body: `Vibe couldn't finish the latest request for ${name}. You weren't charged for it. Open the project and press Retry, or change the request.`,
        action: "Open the project",
        href: content.projectUrl,
      };
    case "run-out-of-credits":
      return {
        subject: `${name} paused: you're out of credits`,
        heading: "Your build paused",
        body: `Vibe stopped early on ${name} because your credits ran out. Top up to continue from where it left off.`,
        action: "Top up credits",
        href: content.usageUrl,
      };
    case "export-finished":
      return {
        subject: `${name} is on GitHub`,
        heading: `${name} is on GitHub`,
        body: "Your project was pushed to your GitHub repository.",
        action: githubUrl(content.repositoryUrl)
          ? "Open the repository"
          : "Open the project",
        href: githubUrl(content.repositoryUrl) ?? content.projectUrl,
      };
    case "export-failed":
      return {
        subject: `The GitHub export of ${name} failed`,
        heading: "The GitHub export failed",
        body: `Vibe couldn't push ${name} to GitHub. Open the project and retry the export.`,
        action: "Open the project",
        href: content.projectUrl,
      };
  }
}

export function renderNotification(content: NotificationContent) {
  const name = oneLine(content.projectName) || "Your project";
  const copy = copyFor(content, name);
  const footer = `You get this email because notifications are on. Turn them off under Notifications in your account menu: ${content.settingsUrl}`;
  const text = [
    copy.heading,
    "",
    copy.body,
    "",
    `${copy.action}: ${copy.href}`,
    "",
    "—",
    footer,
  ].join("\n");
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>${escape(copy.subject)}</title>
</head>
<body style="margin:0;padding:24px;background:#f6f6f6;color:#111111;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;">
<tr><td style="padding:32px;">
<h1 style="margin:0 0 12px;font-size:20px;line-height:1.3;">${escape(copy.heading)}</h1>
<p style="margin:0 0 24px;font-size:16px;line-height:1.5;">${escape(copy.body)}</p>
<a href="${escape(copy.href)}" style="display:inline-block;padding:12px 20px;background:#111111;color:#ffffff;text-decoration:none;border-radius:8px;font-size:16px;">${escape(copy.action)}</a>
<p style="margin:24px 0 0;font-size:14px;line-height:1.5;color:#555555;">Or open this link: <a href="${escape(copy.href)}" style="color:#555555;">${escape(copy.href)}</a></p>
</td></tr>
<tr><td style="padding:0 32px 32px;font-size:12px;line-height:1.5;color:#666666;">${escape(footer)}</td></tr>
</table>
</body>
</html>`;
  return { subject: copy.subject, html, text };
}
