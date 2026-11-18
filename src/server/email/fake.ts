import type { EmailMessage, EmailProvider, SendResult } from "./types";

export function fakeEmailProvider(
  respond: (message: EmailMessage) => SendResult = () => ({
    status: "sent",
    id: "email_fake",
  }),
) {
  const sent: EmailMessage[] = [];
  const provider: EmailProvider = {
    async send(message) {
      sent.push(message);
      return respond(message);
    },
  };
  return { provider, sent };
}
