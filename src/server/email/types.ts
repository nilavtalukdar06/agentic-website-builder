export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
  idempotencyKey: string;
};

export type SendResult =
  | { status: "sent"; id: string }
  | { status: "rejected"; reason: string }
  | { status: "retry"; reason: string };

export interface EmailProvider {
  send(message: EmailMessage): Promise<SendResult>;
}
