import { existsSync, readdirSync } from "fs";
import { homedir, platform } from "os";
import { join } from "path";

// ─── Logos Data Paths ────────────────────────────────────────────────────────

function getLogosBaseDir(subdir: "Documents" | "Data"): string {
  let base: string;
  if (platform() === "win32") {
    const localAppData =
      process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local");
    base = join(localAppData, "Logos", subdir);
  } else {
    base = join(homedir(), "Library", "Application Support", "Logos4", subdir);
  }

  return base;
}

/**
 * Resolve the platform-specific Logos base directory for Documents or Data,
 * then auto-discover the user-specific hash folder inside it.
 *
 *   macOS:   ~/Library/Application Support/Logos4/{subdir}/{hash}
 *   Windows: %LOCALAPPDATA%\Logos\{subdir}\{hash}
 */
function resolveLogosDir(
  subdir: "Documents" | "Data",
  validationPath: string,
  envVarName: "LOGOS_DATA_DIR" | "LOGOS_CATALOG_DIR"
): string {
  const base = getLogosBaseDir(subdir);
  const entries = readdirSync(base, { withFileTypes: true })
    .filter((entry) => entry.isDirectory());

  if (entries.length === 0) {
    throw new Error(
      `No Logos user folders found in ${base}. Set ${envVarName} to the correct path.`
    );
  }

  if (entries.length === 1) {
    return join(base, entries[0].name);
  }

  const matches = entries.filter((entry) =>
    existsSync(join(base, entry.name, validationPath))
  );

  if (matches.length === 1) {
    return join(base, matches[0].name);
  }

  throw new Error(
    `Could not uniquely determine the Logos ${subdir} folder in ${base}. ` +
    `Set ${envVarName} to the correct path.`
  );
}

export const LOGOS_DATA_DIR =
  process.env.LOGOS_DATA_DIR ??
  resolveLogosDir("Documents", join("VisualMarkup", "visualmarkup.db"), "LOGOS_DATA_DIR");

// Catalog DB lives under Data/ (not Documents/)
export const LOGOS_CATALOG_DIR =
  process.env.LOGOS_CATALOG_DIR ??
  resolveLogosDir("Data", join("LibraryCatalog", "catalog.db"), "LOGOS_CATALOG_DIR");

export const DB_PATHS = {
  visualMarkup: join(LOGOS_DATA_DIR, "VisualMarkup", "visualmarkup.db"),
  favorites: join(LOGOS_DATA_DIR, "FavoritesManager", "favorites.db"),
  workflows: join(LOGOS_DATA_DIR, "Workflows", "Workflows.db"),
  readingLists: join(LOGOS_DATA_DIR, "ReadingLists", "ReadingLists.db"),
  shortcuts: join(LOGOS_DATA_DIR, "ShortcutsManager", "shortcuts.db"),
  guides: join(LOGOS_DATA_DIR, "Guides", "guides.db"),
  notes: join(LOGOS_DATA_DIR, "NotesToolManager", "notestool.db"),
  clippings: join(LOGOS_DATA_DIR, "Documents", "Clippings", "Clippings.db"),
  passageLists: join(LOGOS_DATA_DIR, "Documents", "PassageList", "PassageList.db"),
  catalog: join(LOGOS_CATALOG_DIR, "LibraryCatalog", "catalog.db"),
} as const;

// ─── Biblia API ──────────────────────────────────────────────────────────────

export const BIBLIA_API_KEY = process.env.BIBLIA_API_KEY ?? "";
export const BIBLIA_API_BASE = "https://api.biblia.com/v1/bible";
export const DEFAULT_BIBLE = "LEB";

// ─── Logos URL Schemes ───────────────────────────────────────────────────────

export const LOGOS_URL_BASE = "logos4:";

// ─── Server Info ─────────────────────────────────────────────────────────────

export const SERVER_NAME = "logos-bible";
export const SERVER_VERSION = "1.0.0";
