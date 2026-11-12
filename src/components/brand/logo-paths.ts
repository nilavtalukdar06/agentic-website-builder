export const logoViewBox = "0 0 24 24";
export const logoStrokeWidth = 5;
export const logoPath = "M5.5 5.5 12 18.5 18.5 5.5";
export const logoGradient = {
  x1: 20,
  y1: 3,
  x2: 5,
  y2: 21,
  stops: [
    { offset: 0, color: "#ff8a3d" },
    { offset: 0.45, color: "#ff4d8d" },
    { offset: 1, color: "#7a5cff" },
  ],
} as const;

export const brandHex = {
  dark: {
    background: "#151515",
    border: "#333333",
    foreground: "#eeeeee",
    muted: "#ababab",
  },
  light: { background: "#fcfcfc", border: "#dedede", foreground: "#161616" },
} as const;
