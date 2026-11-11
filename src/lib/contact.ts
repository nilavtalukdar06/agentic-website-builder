export const contactChannels = [
  {
    id: "email",
    label: "Email",
    handle: "nilavtalukdar9@gmail.com",
    href: "mailto:nilavtalukdar9@gmail.com",
    description: "Support, billing questions and feedback.",
  },
  {
    id: "instagram",
    label: "Instagram",
    handle: "@nilav.talukdar",
    href: "https://www.instagram.com/nilav.talukdar",
    description: "Follow along or send a message.",
  },
  {
    id: "linkedin",
    label: "LinkedIn",
    handle: "Nilav Talukdar",
    href: "https://www.linkedin.com/in/nilav-talukdar",
    description: "Work enquiries and professional contact.",
  },
  {
    id: "github",
    label: "GitHub",
    handle: "@nilavtalukdar06",
    href: "https://github.com/nilavtalukdar06",
    description: "Source, bug reports and the other things I build.",
  },
] as const;

export type ContactChannelId = (typeof contactChannels)[number]["id"];

export const CONTACT_EMAIL = contactChannels[0].handle;
