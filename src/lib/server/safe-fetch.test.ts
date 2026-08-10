import { describe, expect, it } from "vitest";

import { isPrivateAddress, parsePublicUrl } from "@/lib/server/safe-fetch";

describe("safe source URLs", () => {
  it.each([
    "127.0.0.1",
    "10.0.0.8",
    "172.16.10.2",
    "192.168.1.20",
    "169.254.169.254",
    "::1",
    "fd00::1",
    "fe80::1234",
  ])("blocks private or local address %s", (address) => {
    expect(isPrivateAddress(address)).toBe(true);
  });

  it.each(["1.1.1.1", "8.8.8.8", "2606:4700:4700::1111"])(
    "allows globally routable address %s",
    (address) => {
      expect(isPrivateAddress(address)).toBe(false);
    },
  );

  it("rejects localhost URLs before a network request", () => {
    expect(() => parsePublicUrl("http://localhost:3000/private")).toThrow(/本机或内网/);
  });

  it("accepts a public HTTPS document URL", () => {
    expect(parsePublicUrl("https://example.com/guide").hostname).toBe("example.com");
  });
});
