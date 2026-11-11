import { describe, expect, test } from "vitest";
import { isSafeCallbackURL, loadSignInSearchParams } from "./sign-in";

describe("sign-in search params", () => {
  test("accepts relative paths", () => {
    expect(isSafeCallbackURL("/")).toBe(true);
    expect(isSafeCallbackURL("/p/demo?view=code")).toBe(true);
  });

  test("rejects external and protocol-relative URLs", () => {
    expect(isSafeCallbackURL("https://evil.example")).toBe(false);
    expect(isSafeCallbackURL("//evil.example")).toBe(false);
    expect(isSafeCallbackURL("/\\evil.example")).toBe(false);
    expect(isSafeCallbackURL("javascript:alert(1)")).toBe(false);
  });

  test("falls back to / for unsafe callbacks", () => {
    expect(
      loadSignInSearchParams({ callbackURL: "https://evil.example" }),
    ).toEqual({ callbackURL: "/", error: null });
  });

  test("keeps a safe callback and the error code", () => {
    expect(
      loadSignInSearchParams({
        callbackURL: "/projects",
        error: "access_denied",
      }),
    ).toEqual({ callbackURL: "/projects", error: "access_denied" });
  });
});
