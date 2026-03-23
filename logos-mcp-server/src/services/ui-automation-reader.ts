import { execFile } from "child_process";
import { writeFile, unlink } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { platform } from "os";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export interface ResourceTextResult {
  tabName: string;
  text: string;
  charCount: number;
  pageCount: number;
}

export interface ResourceTextError {
  error: string;
  availableTabs?: string[];
}

/**
 * Build the PowerShell script that uses Windows UI Automation to read
 * text from the active Logos resource panel.
 */
function buildScript(tabName: string, maxPages: number): string {
  // Escape the tab name for PowerShell string interpolation
  const safeTabName = tabName.replace(/'/g, "''");

  return `
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

function Write-Json($obj) { $obj | ConvertTo-Json -Depth 3 -Compress }

try {
    $root = [System.Windows.Automation.AutomationElement]::RootElement
    $proc = Get-Process -Name "Logos" -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $proc) {
        Write-Json @{ success = $false; error = "Logos is not running" }
        exit
    }

    $pidCond = New-Object System.Windows.Automation.PropertyCondition(
        [System.Windows.Automation.AutomationElement]::ProcessIdProperty,
        $proc.Id
    )
    $window = $root.FindFirst([System.Windows.Automation.TreeScope]::Children, $pidCond)
    if (-not $window) {
        Write-Json @{ success = $false; error = "Logos window not found" }
        exit
    }

    # --- Locate Document elements (CEF: Edit+Document class, WPF: ControlType.Document) ---
    $editCond = New-Object System.Windows.Automation.PropertyCondition(
        [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
        [System.Windows.Automation.ControlType]::Edit
    )
    $classCond = New-Object System.Windows.Automation.PropertyCondition(
        [System.Windows.Automation.AutomationElement]::ClassNameProperty,
        "Document"
    )
    $cefCond = New-Object System.Windows.Automation.AndCondition($editCond, $classCond)
    $docTypeCond = New-Object System.Windows.Automation.PropertyCondition(
        [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
        [System.Windows.Automation.ControlType]::Document
    )

    $candidates = @()
    $cefDocs = $window.FindAll([System.Windows.Automation.TreeScope]::Descendants, $cefCond)
    foreach ($d in $cefDocs) { $candidates += $d }
    $wpfDocs = $window.FindAll([System.Windows.Automation.TreeScope]::Descendants, $docTypeCond)
    foreach ($d in $wpfDocs) { $candidates += $d }

    if ($candidates.Count -eq 0) {
        Write-Json @{ success = $false; error = "No document content found in Logos. Make sure a resource is open." }
        exit
    }

    # --- Walk up from each candidate to find its parent TabItem ---
    $walker = [System.Windows.Automation.TreeWalker]::ControlViewWalker
    $targetDoc = $null
    $targetTab = ""
    $wantTab = '${safeTabName}'

    foreach ($doc in $candidates) {
        $el = $doc
        for ($i = 0; $i -lt 15; $i++) {
            $el = $walker.GetParent($el)
            if (-not $el) { break }
            if ($el.Current.ControlType.ProgrammaticName -eq "ControlType.TabItem") {
                $tn = $el.Current.Name
                if ($wantTab -eq "" -or $tn -like "*$wantTab*") {
                    # Verify this element actually has text content
                    $pats = $doc.GetSupportedPatterns()
                    $hasTextOrValue = $false
                    foreach ($p in $pats) {
                        if ($p.ProgrammaticName -match "Value|Text") { $hasTextOrValue = $true; break }
                    }
                    if ($hasTextOrValue) {
                        $targetDoc = $doc
                        $targetTab = $tn
                    }
                }
                break
            }
        }
        if ($targetDoc) { break }
    }

    if (-not $targetDoc) {
        $tabNames = @()
        $tabCond = New-Object System.Windows.Automation.PropertyCondition(
            [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
            [System.Windows.Automation.ControlType]::TabItem
        )
        $tabs = $window.FindAll([System.Windows.Automation.TreeScope]::Descendants, $tabCond)
        foreach ($t in $tabs) {
            if ($t.Current.Name.Length -gt 0) { $tabNames += $t.Current.Name }
        }
        Write-Json @{ success = $false; error = "No matching document found for tab filter"; availableTabs = $tabNames }
        exit
    }

    # --- Extract text via ValuePattern or TextPattern ---
    $text = ""
    $patterns = $targetDoc.GetSupportedPatterns()
    foreach ($pat in $patterns) {
        if ($pat.ProgrammaticName -eq "ValuePatternIdentifiers.Pattern") {
            $vp = $targetDoc.GetCurrentPattern($pat)
            $text = $vp.Current.Value
            break
        }
        if ($pat.ProgrammaticName -eq "TextPatternIdentifiers.Pattern") {
            $tp = $targetDoc.GetCurrentPattern($pat)
            $text = $tp.DocumentRange.GetText(-1)
            break
        }
    }

    if ($text.Length -eq 0) {
        Write-Json @{ success = $false; error = "Document found but no text content available" }
        exit
    }

    $pageCount = 1
    $maxPages = ${maxPages}

    if ($maxPages -gt 1) {
        Add-Type -AssemblyName System.Windows.Forms
        Add-Type @"
using System;
using System.Runtime.InteropServices;
public class W32 {
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
}
"@
        $hwnd = $proc.MainWindowHandle
        [void][W32]::ShowWindow($hwnd, 9)
        Start-Sleep -Milliseconds 300
        [void][W32]::SetForegroundWindow($hwnd)
        Start-Sleep -Milliseconds 300

        $allTexts = @($text)
        $seenKeys = @{}
        $trimmed = $text.TrimStart()
        if ($trimmed.Length -gt 0) {
            $seenKeys[$trimmed.Substring(0, [Math]::Min(80, $trimmed.Length))] = $true
        }

        for ($pg = 1; $pg -lt $maxPages; $pg++) {
            [System.Windows.Forms.SendKeys]::SendWait("{PGDN}")
            Start-Sleep -Milliseconds 400

            $newText = ""
            foreach ($pat in $patterns) {
                if ($pat.ProgrammaticName -eq "ValuePatternIdentifiers.Pattern") {
                    $vp2 = $targetDoc.GetCurrentPattern($pat)
                    $newText = $vp2.Current.Value
                    break
                }
                if ($pat.ProgrammaticName -eq "TextPatternIdentifiers.Pattern") {
                    $tp2 = $targetDoc.GetCurrentPattern($pat)
                    $newText = $tp2.DocumentRange.GetText(-1)
                    break
                }
            }

            $ntrim = $newText.TrimStart()
            if ($ntrim.Length -eq 0) { break }
            $nkey = $ntrim.Substring(0, [Math]::Min(80, $ntrim.Length))
            if ($seenKeys.ContainsKey($nkey)) { break }
            $seenKeys[$nkey] = $true
            $allTexts += $newText
        }

        $text = ($allTexts | ForEach-Object { $_.Trim() }) -join "\`n\`n"
        $pageCount = $allTexts.Count
    }

    $textBytes = [System.Text.Encoding]::UTF8.GetBytes($text)
    $textBase64 = [Convert]::ToBase64String($textBytes)

    Write-Json @{
        success = $true
        tabName = $targetTab
        textBase64 = $textBase64
        charCount = $text.Length
        pageCount = $pageCount
    }
} catch {
    Write-Json @{ success = $false; error = $_.Exception.Message }
}
`;
}

/**
 * Read text from an open resource panel in Logos Bible Software
 * using Windows UI Automation.
 *
 * @param tabName  - Optional partial tab name to match (e.g., "Guide for the Perplexed")
 * @param maxPages - Number of pages to read (1 = visible only, >1 = scroll)
 */
export async function readResourceText(
  tabName?: string,
  maxPages?: number,
): Promise<ResourceTextResult> {
  if (platform() !== "win32") {
    throw new Error("Resource text extraction requires Windows");
  }

  const pages = Math.max(1, Math.min(maxPages ?? 1, 50));
  const script = buildScript(tabName ?? "", pages);

  const scriptPath = join(tmpdir(), `logos-uia-${process.pid}.ps1`);
  await writeFile(scriptPath, script, "utf-8");

  let rawOutput = "";
  try {
    try {
      const { stdout } = await execFileAsync(
        "powershell",
        ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath],
        { timeout: 60_000, maxBuffer: 10 * 1024 * 1024 },
      );
      rawOutput = stdout;
    } catch (e: unknown) {
      if (e && typeof e === "object" && "stdout" in e) {
        rawOutput = (e as { stdout?: string }).stdout ?? "";
      }
      if (!rawOutput) {
        const msg = e instanceof Error ? e.message : String(e);
        throw new Error(`PowerShell execution failed: ${msg}`);
      }
    }

    const jsonStart = rawOutput.indexOf("{");
    if (jsonStart === -1) {
      throw new Error(`No JSON in output. Raw: ${rawOutput.substring(0, 500)}`);
    }

    const result = JSON.parse(rawOutput.substring(jsonStart));

    if (!result.success) {
      const errMsg = result.error ?? "Unknown error reading resource text";
      if (result.availableTabs) {
        throw new Error(`${errMsg}\nOpen tabs: ${result.availableTabs.join(", ")}`);
      }
      throw new Error(errMsg);
    }

    return {
      tabName: result.tabName,
      text: Buffer.from(result.textBase64, "base64").toString("utf-8"),
      charCount: result.charCount,
      pageCount: result.pageCount,
    };
  } catch (e: unknown) {
    if (e instanceof SyntaxError) {
      throw new Error(`Failed to parse output. Raw: ${rawOutput.substring(0, 500)}`);
    }
    throw e;
  } finally {
    await unlink(scriptPath).catch(() => {});
  }
}
