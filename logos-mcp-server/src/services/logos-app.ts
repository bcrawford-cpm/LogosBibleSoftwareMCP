import { execFile } from "child_process";
import { platform } from "os";
import { promisify } from "util";
import { toLogosUrlRef } from "./reference-parser.js";
import type { LogosCommandResult } from "../types.js";

const execFileAsync = promisify(execFile);

function launcherForCurrentPlatform(): string {
  return platform() === "win32" ? "rundll32.exe" : "open";
}

async function openUrl(url: string): Promise<LogosCommandResult> {
  const launcher = launcherForCurrentPlatform();
  try {
    if (platform() === "win32") {
      // Use the registered protocol handler directly so URLs with '&' are not parsed by cmd.exe.
      await execFileAsync("rundll32.exe", ["url.dll,FileProtocolHandler", url], {
        windowsHide: true,
      });
    } else {
      await execFileAsync("open", [url]);
    }
    return { success: true, command: url, launcher };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, command: url, launcher, error: msg };
  }
}

/**
 * Navigates to a Bible passage in Logos.
 */
export async function navigateToPassage(reference: string): Promise<LogosCommandResult> {
  try {
    const logosRef = toLogosUrlRef(reference);
    return openUrl(`logos4:///Bible/${logosRef}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, command: `logos4:///Bible/...`, launcher: launcherForCurrentPlatform(), error: msg };
  }
}

export async function searchBibleInLogos(query: string): Promise<LogosCommandResult> {
  const encoded = encodeURIComponent(query);
  return openUrl(`logos4:///Search?type=Bible&q=${encoded}`);
}

export async function openWordStudy(word: string): Promise<LogosCommandResult> {
  const encoded = encodeURIComponent(word);
  return openUrl(`logos4:///WordStudy?word=${encoded}`);
}

export async function openFactbook(topic: string): Promise<LogosCommandResult> {
  const encoded = encodeURIComponent(topic);
  return openUrl(`logos4:///Factbook?ref=${encoded}`);
}

/**
 * Opens a resource in Logos with an optional reference.
 * The reference should be in Logos milestone format (e.g., 'bible.24.1.1', 'page.271').
 * Use getResourceReferenceInfo() to discover valid reference types for a given resource.
 */
export async function openResource(
  resourceId: string,
  reference?: string
): Promise<LogosCommandResult> {
  try {
    const encodedId = encodeURIComponent(resourceId);
    let url = `logosres:${encodedId}`;
    
    if (reference) {
      url += `;ref=${encodeURIComponent(reference)}`;
    }
    
    return openUrl(url);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, command: `logosres:${resourceId}`, launcher: launcherForCurrentPlatform(), error: msg };
  }
}

export async function openGuide(
  guideType: string,
  reference: string
): Promise<LogosCommandResult> {
  try {
    const logosRef = toLogosUrlRef(reference);
    const template = encodeURIComponent(guideType);
    return openUrl(`logos4:///Guide?t=${template}&ref=bible.${logosRef}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, command: "", launcher: launcherForCurrentPlatform(), error: msg };
  }
}

export async function searchAll(query: string): Promise<LogosCommandResult> {
  const encoded = encodeURIComponent(query);
  return openUrl(`logos4:///Search?kind=AllSearch&syntax=v2&q=${encoded}`);
}

export async function isLogosRunning(): Promise<boolean> {
  try {
    if (platform() === "win32") {
      const { stdout } = await execFileAsync("tasklist", [
        "/FI", "IMAGENAME eq Logos.exe", "/NH",
      ]);
      return stdout.toLowerCase().includes("logos.exe");
    } else {
      const { stdout } = await execFileAsync("osascript", [
        "-e",
        'tell application "System Events" to (name of processes) contains "Logos"',
      ]);
      return stdout.trim() === "true";
    }
  } catch {
    return false;
  }
}
