export function getSpeechRecognition() {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}

export function joinTranscript(base: string, transcript: string) {
  const spoken = transcript.trim();
  if (!spoken) return base;
  if (!base || /\s$/.test(base)) return `${base}${spoken}`;
  return `${base} ${spoken}`;
}

const speechErrors: Record<string, string | null> = {
  "not-allowed":
    "Microphone access is blocked. Allow it in your browser's site settings, then try again.",
  "service-not-allowed":
    "Your browser doesn't allow voice input for this site. Check its privacy settings.",
  "audio-capture": "No microphone was found. Connect one and try again.",
  network: "Voice input needs an internet connection.",
  "language-not-supported": "Your browser can't transcribe your language.",
  "no-speech": "I didn't hear anything. Try again.",
  aborted: null,
};

export function speechErrorMessage(error: string) {
  return Object.hasOwn(speechErrors, error)
    ? speechErrors[error]
    : "Voice input stopped unexpectedly. Try again.";
}
