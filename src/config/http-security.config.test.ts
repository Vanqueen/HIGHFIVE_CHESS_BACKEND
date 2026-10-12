import { describe, expect, it } from "vitest";
import {
  getAllowedClientOrigins,
  getCorsOptions,
  getTrustedProxyHops,
  isClientOriginAllowed,
} from "./http-security.config";

describe("HTTP security configuration", () => {
  it("uses the local client origin by default outside production", () => {
    expect(getAllowedClientOrigins({ NODE_ENV: "development" }))
      .toEqual(["http://localhost:5173"]);
  });

  it("requires explicitly configured origins in production", () => {
    expect(getAllowedClientOrigins({ NODE_ENV: "production" })).toEqual([]);
    expect(getAllowedClientOrigins({
      NODE_ENV: "production",
      CLIENT_ORIGINS: "https://chess.example, https://admin.example/",
    })).toEqual(["https://chess.example", "https://admin.example"]);
  });

  it("rejects malformed origins and non-origin URL components", () => {
    expect(() => getAllowedClientOrigins({
      NODE_ENV: "production",
      CLIENT_ORIGINS: "https://chess.example/app",
    })).toThrow("CLIENT_ORIGINS");
    expect(() => getAllowedClientOrigins({
      NODE_ENV: "production",
      CLIENT_ORIGINS: "*",
    })).toThrow("CLIENT_ORIGINS");
  });

  it("allows requests without an Origin header and denies unknown browser origins", () => {
    expect(isClientOriginAllowed(undefined, ["https://chess.example"])).toBe(true);
    expect(isClientOriginAllowed("https://chess.example", ["https://chess.example"])).toBe(true);
    expect(isClientOriginAllowed("https://other.example", ["https://chess.example"])).toBe(false);
  });

  it("does not trust forwarded addresses unless a valid hop count is configured", () => {
    expect(getTrustedProxyHops({})).toBe(0);
    expect(getTrustedProxyHops({ TRUST_PROXY_HOPS: "2" })).toBe(2);
    expect(() => getTrustedProxyHops({ TRUST_PROXY_HOPS: "loopback" }))
      .toThrow("TRUST_PROXY_HOPS");
  });

  it("keeps CORS origins and HTTP methods explicit", () => {
    const cors = getCorsOptions({
      NODE_ENV: "production",
      CLIENT_ORIGINS: "https://chess.example",
    });

    expect(cors.methods).toEqual(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"]);
    expect(typeof cors.origin).toBe("function");
  });
});
