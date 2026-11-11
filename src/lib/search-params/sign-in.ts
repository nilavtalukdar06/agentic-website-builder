import { createLoader, createParser, parseAsString } from "nuqs/server";

export function isSafeCallbackURL(value: string) {
  return (
    value.startsWith("/") && !value.startsWith("//") && !value.includes("\\")
  );
}

export const parseAsCallbackURL = createParser({
  parse: (value) => (isSafeCallbackURL(value) ? value : null),
  serialize: (value) => value,
});

export const signInSearchParams = {
  callbackURL: parseAsCallbackURL.withDefault("/"),
  error: parseAsString,
};

export const loadSignInSearchParams = createLoader(signInSearchParams);
