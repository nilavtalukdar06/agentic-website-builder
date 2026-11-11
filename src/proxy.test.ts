// @vitest-environment node
import { NextRequest } from "next/server";
import { describe, expect, test } from "vitest";
import { config, proxy } from "./proxy";

function request(path: string, cookie?: string) {
  return new NextRequest(new URL(path, "http://localhost:3000"), {
    headers: cookie ? { cookie } : undefined,
  });
}

describe("proxy", () => {
  test("redirects signed-out users to sign-in with the callback", () => {
    const response = proxy(request("/projects?q=coffee shop"));
    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/sign-in");
    expect(location.searchParams.get("callbackURL")).toBe(
      "/projects?q=coffee%20shop",
    );
  });

  test("lets requests with a session cookie through", () => {
    const response = proxy(request("/", "better-auth.session_token=abc.def"));
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  test("accepts the secure cookie name used over HTTPS", () => {
    const response = proxy(
      request("/", "__Secure-better-auth.session_token=abc.def"),
    );
    expect(response.headers.get("location")).toBeNull();
  });

  test("only guards app routes", () => {
    expect(config.matcher).toEqual([
      "/",
      "/projects/:path*",
      "/usage/:path*",
      "/p/:path*",
    ]);
  });
});
