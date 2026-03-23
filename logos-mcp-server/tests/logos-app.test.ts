import { beforeEach, describe, expect, it, vi } from "vitest";

const execFileMock = vi.hoisted(() => vi.fn());
const platformMock = vi.hoisted(() => vi.fn());
const promisifyMock = vi.hoisted(
  () =>
    (fn: (...args: unknown[]) => void) =>
    (...args: unknown[]) =>
      new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
        fn(...args, (error: Error | null, stdout: string, stderr: string) => {
          if (error) {
            reject(error);
            return;
          }
          resolve({ stdout, stderr });
        });
      })
);

vi.mock("child_process", () => ({
  execFile: execFileMock,
}));

vi.mock("util", async () => {
  const actual = await vi.importActual<typeof import("util")>("util");
  return {
    ...actual,
    promisify: promisifyMock,
  };
});

vi.mock("os", async () => {
  const actual = await vi.importActual<typeof import("os")>("os");
  return {
    ...actual,
    platform: platformMock,
  };
});

describe("logos-app", () => {
  beforeEach(() => {
    vi.resetModules();
    execFileMock.mockReset();
    platformMock.mockReset();
    execFileMock.mockImplementation((...args: unknown[]) => {
      const callback = args[args.length - 1] as (error: Error | null, stdout: string, stderr: string) => void;
      callback(null, "", "");
    });
  });

  it("uses the Windows start command for Logos URLs", async () => {
    platformMock.mockReturnValue("win32");
    const logosApp = await import("../src/services/logos-app.js");

    await logosApp.searchBibleInLogos("grace alone");

    expect(execFileMock).toHaveBeenCalledWith(
      "cmd",
      ["/c", "start", "", "logos4:///Search?type=Bible&q=grace%20alone"],
      expect.any(Function)
    );
  });

  it("uses the macOS open command for Logos URLs", async () => {
    platformMock.mockReturnValue("darwin");
    const logosApp = await import("../src/services/logos-app.js");

    await logosApp.openFactbook("Moses");

    expect(execFileMock).toHaveBeenCalledWith(
      "open",
      ["logos4:///Factbook?ref=Moses"],
      expect.any(Function)
    );
  });

  it("uses tasklist to detect a running Logos process on Windows", async () => {
    platformMock.mockReturnValue("win32");
    execFileMock.mockImplementation((...args: unknown[]) => {
      const callback = args[args.length - 1] as (error: Error | null, stdout: string, stderr: string) => void;
      callback(null, "Logos.exe                    1234 Console                    1     12,000 K", "");
    });
    const logosApp = await import("../src/services/logos-app.js");

    await expect(logosApp.isLogosRunning()).resolves.toBe(true);
    expect(execFileMock).toHaveBeenCalledWith(
      "tasklist",
      ["/FI", "IMAGENAME eq Logos.exe", "/NH"],
      expect.any(Function)
    );
  });

  it("returns false when tasklist shows no running Logos process", async () => {
    platformMock.mockReturnValue("win32");
    execFileMock.mockImplementation((...args: unknown[]) => {
      const callback = args[args.length - 1] as (error: Error | null, stdout: string, stderr: string) => void;
      callback(null, "INFO: No tasks are running which match the specified criteria.", "");
    });
    const logosApp = await import("../src/services/logos-app.js");

    await expect(logosApp.isLogosRunning()).resolves.toBe(false);
  });

  it("uses AppleScript to detect a running Logos process on macOS", async () => {
    platformMock.mockReturnValue("darwin");
    execFileMock.mockImplementation((...args: unknown[]) => {
      const callback = args[args.length - 1] as (error: Error | null, stdout: string, stderr: string) => void;
      callback(null, "true\n", "");
    });
    const logosApp = await import("../src/services/logos-app.js");

    await expect(logosApp.isLogosRunning()).resolves.toBe(true);
    expect(execFileMock).toHaveBeenCalledWith(
      "osascript",
      [
        "-e",
        'tell application "System Events" to (name of processes) contains "Logos"',
      ],
      expect.any(Function)
    );
  });

  it("reports command failures as unsuccessful results", async () => {
    platformMock.mockReturnValue("win32");
    execFileMock.mockImplementation((...args: unknown[]) => {
      const callback = args[args.length - 1] as (error: Error | null, stdout: string, stderr: string) => void;
      callback(new Error("start failed"), "", "");
    });
    const logosApp = await import("../src/services/logos-app.js");

    await expect(logosApp.searchAll("grace")).resolves.toEqual({
      success: false,
      command: "logos4:///Search?kind=AllSearch&syntax=v2&q=grace",
      error: "start failed",
    });
  });
});