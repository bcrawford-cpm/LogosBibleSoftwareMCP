import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { join } from "path";

const readdirSyncMock = vi.hoisted(() => vi.fn());
const existsSyncMock = vi.hoisted(() => vi.fn());
const homedirMock = vi.hoisted(() => vi.fn());
const platformMock = vi.hoisted(() => vi.fn());

vi.mock("fs", () => ({
  existsSync: existsSyncMock,
  readdirSync: readdirSyncMock,
}));

vi.mock("os", () => ({
  homedir: homedirMock,
  platform: platformMock,
}));

function dirEntry(name: string) {
  return {
    isDirectory: () => true,
    name,
  };
}

describe("config", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    readdirSyncMock.mockReset();
    existsSyncMock.mockReset();
    homedirMock.mockReset();
    platformMock.mockReset();
    homedirMock.mockReturnValue("/Users/tester");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("resolves a Windows Documents and Data folder from LOCALAPPDATA", async () => {
    platformMock.mockReturnValue("win32");
    vi.stubEnv("LOCALAPPDATA", "C:\\Users\\tester\\AppData\\Local");
    readdirSyncMock
      .mockReturnValueOnce([dirEntry("abc123")])
      .mockReturnValueOnce([dirEntry("xyz789")]);

    const config = await import("../src/config.js");

    expect(config.LOGOS_DATA_DIR).toBe(
      join("C:\\Users\\tester\\AppData\\Local", "Logos", "Documents", "abc123")
    );
    expect(config.LOGOS_CATALOG_DIR).toBe(
      join("C:\\Users\\tester\\AppData\\Local", "Logos", "Data", "xyz789")
    );
  });

  it("resolves a macOS folder from the home directory", async () => {
    platformMock.mockReturnValue("darwin");
    homedirMock.mockReturnValue("/Users/tester");
    readdirSyncMock
      .mockReturnValueOnce([dirEntry("docs-hash")])
      .mockReturnValueOnce([dirEntry("data-hash")]);

    const config = await import("../src/config.js");

    expect(config.LOGOS_DATA_DIR).toBe(
      join("/Users/tester", "Library", "Application Support", "Logos4", "Documents", "docs-hash")
    );
    expect(config.LOGOS_CATALOG_DIR).toBe(
      join("/Users/tester", "Library", "Application Support", "Logos4", "Data", "data-hash")
    );
  });

  it("uses explicit env var overrides instead of auto-discovery", async () => {
    platformMock.mockReturnValue("win32");
    vi.stubEnv("LOGOS_DATA_DIR", "C:\\custom\\documents\\hash");
    vi.stubEnv("LOGOS_CATALOG_DIR", "C:\\custom\\data\\hash");

    const config = await import("../src/config.js");

    expect(config.LOGOS_DATA_DIR).toBe("C:\\custom\\documents\\hash");
    expect(config.LOGOS_CATALOG_DIR).toBe("C:\\custom\\data\\hash");
    expect(readdirSyncMock).not.toHaveBeenCalled();
  });

  it("throws a clear error when no Logos user folder exists", async () => {
    platformMock.mockReturnValue("win32");
    vi.stubEnv("LOCALAPPDATA", "C:\\Users\\tester\\AppData\\Local");
    readdirSyncMock.mockReturnValue([]);

    await expect(import("../src/config.js")).rejects.toThrow(
      /No Logos user folders found/
    );
  });

  it("selects the uniquely matching Documents folder when multiple hashes exist", async () => {
    platformMock.mockReturnValue("win32");
    vi.stubEnv("LOCALAPPDATA", "C:\\Users\\tester\\AppData\\Local");
    readdirSyncMock
      .mockReturnValueOnce([dirEntry("old-hash"), dirEntry("active-hash")])
      .mockReturnValueOnce([dirEntry("catalog-hash")]);
    existsSyncMock.mockImplementation((path: string) =>
      path.includes(join("active-hash", "VisualMarkup", "visualmarkup.db"))
    );

    const config = await import("../src/config.js");

    expect(config.LOGOS_DATA_DIR).toBe(
      join("C:\\Users\\tester\\AppData\\Local", "Logos", "Documents", "active-hash")
    );
  });

  it("throws when multiple matching user folders make auto-detection ambiguous", async () => {
    platformMock.mockReturnValue("win32");
    vi.stubEnv("LOCALAPPDATA", "C:\\Users\\tester\\AppData\\Local");
    readdirSyncMock.mockReturnValue([dirEntry("hash-one"), dirEntry("hash-two")]);
    existsSyncMock.mockReturnValue(true);

    await expect(import("../src/config.js")).rejects.toThrow(
      /Could not uniquely determine/
    );
  });
});