import { describe, expect, it } from "vitest";
import { APP_VERSION, isNewer, versionDate } from "./version";

describe("isNewer", () => {
  it("erkennt eine später gebaute Version", () => {
    expect(isNewer("20261123.160500", "20261123.120000")).toBe(true);
    expect(isNewer("20261124.080000", "20261123.235959")).toBe(true);
  });

  it("meldet nichts bei gleicher oder älterer Version", () => {
    expect(isNewer("20261123.120000", "20261123.120000")).toBe(false);
    expect(isNewer("20261122.120000", "20261123.120000")).toBe(false);
  });

  it("meldet nichts ohne Angabe und beim Entwickeln", () => {
    expect(isNewer(null, "20261123.120000")).toBe(false);
    expect(isNewer("", "20261123.120000")).toBe(false);
    expect(isNewer("dev", "20261123.120000")).toBe(false);
    expect(isNewer("20261123.120000", "dev")).toBe(false);
  });

  it("heisst in Tests dev", () => {
    expect(APP_VERSION).toBe("dev");
  });
});

describe("versionDate", () => {
  it("zeigt die Bauzeit in deutscher Zeit", () => {
    // 06:03 UTC ist im Winter 07:03 in Deutschland.
    expect(versionDate("20261124.060321")).toBe("24.11.2026, 07:03 Uhr");
    // Im Sommer sind es zwei Stunden. Kurz vor Mitternacht UTC ist schon der nächste Tag.
    expect(versionDate("20260701.223000")).toBe("02.07.2026, 00:30 Uhr");
  });

  it("gibt nichts für dev oder Unsinn", () => {
    expect(versionDate("dev")).toBeNull();
    expect(versionDate("irgendwas")).toBeNull();
  });
});
