import { beforeEach, describe, expect, it } from "vitest";

import {
  enforceRateLimit,
  readJsonRequest,
  resetRateLimitsForTests,
} from "@/lib/server/request-guard";

describe("request body guard", () => {
  it("parses bounded JSON requests", async () => {
    const request = new Request("https://learnsphere.test/api", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ok: true }),
    });

    await expect(readJsonRequest(request, 100)).resolves.toEqual({ ok: true });
  });

  it("rejects unsupported media types, malformed JSON, and oversized bodies", async () => {
    await expect(
      readJsonRequest(new Request("https://learnsphere.test/api", { method: "POST", body: "{}" }), 100),
    ).rejects.toMatchObject({ code: "UNSUPPORTED_MEDIA_TYPE", status: 415 });
    await expect(
      readJsonRequest(
        new Request("https://learnsphere.test/api", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "not-json",
        }),
        100,
      ),
    ).rejects.toMatchObject({ code: "INVALID_JSON", status: 400 });
    await expect(
      readJsonRequest(
        new Request("https://learnsphere.test/api", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text: "too long" }),
        }),
        5,
      ),
    ).rejects.toMatchObject({ code: "REQUEST_TOO_LARGE", status: 413 });
  });
});

describe("request rate guard", () => {
  beforeEach(resetRateLimitsForTests);

  it("isolates buckets by client address and returns a retry window", () => {
    const request = new Request("https://learnsphere.test/api", {
      headers: { "cf-connecting-ip": "203.0.113.8" },
    });
    enforceRateLimit(request, "tutor", 2, 60_000);
    enforceRateLimit(request, "tutor", 2, 60_000);

    expect(() => enforceRateLimit(request, "tutor", 2, 60_000)).toThrowError(
      expect.objectContaining({ code: "RATE_LIMITED", status: 429 }),
    );
    expect(() => enforceRateLimit(request, "generate", 2, 60_000)).not.toThrow();
  });
});
