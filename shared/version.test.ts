import { describe, expect, it } from "vitest";
import { APP_VERSION, isNewer } from "./version";

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
