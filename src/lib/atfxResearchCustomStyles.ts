import {
  normalizeCustomStyleInstructions,
  normalizeCustomStyleName,
} from "./atfxResearchReportOptions";

export type SavedCustomWritingStyle = {
  id: string;
  name: string;
  instructions: string;
  createdAt: number;
  updatedAt: number;
};

export const MAX_SAVED_CUSTOM_WRITING_STYLES = 24;

const STORAGE_KEY_PREFIX = "atfx.researchReport.customStyles";

export function customStylesStorageKey(userId?: string | null): string {
  const uid = typeof userId === "string" ? userId.trim() : "";
  return uid ? `${STORAGE_KEY_PREFIX}.${uid}` : STORAGE_KEY_PREFIX;
}

function normalizeSavedStyle(raw: unknown): SavedCustomWritingStyle | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id.trim() : "";
  const name = normalizeCustomStyleName(o.name);
  const instructions = normalizeCustomStyleInstructions(o.instructions);
  if (!id || !name) return null;
  const createdAt = typeof o.createdAt === "number" && Number.isFinite(o.createdAt) ? o.createdAt : Date.now();
  const updatedAt = typeof o.updatedAt === "number" && Number.isFinite(o.updatedAt) ? o.updatedAt : createdAt;
  return { id, name, instructions, createdAt, updatedAt };
}

export function loadSavedCustomWritingStyles(userId?: string | null): SavedCustomWritingStyle[] {
  try {
    const raw = localStorage.getItem(customStylesStorageKey(userId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normalizeSavedStyle)
      .filter((s): s is SavedCustomWritingStyle => s != null)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

export function persistSavedCustomWritingStyles(
  styles: SavedCustomWritingStyle[],
  userId?: string | null
): void {
  try {
    localStorage.setItem(customStylesStorageKey(userId), JSON.stringify(styles.slice(0, MAX_SAVED_CUSTOM_WRITING_STYLES)));
  } catch {
    /* quota / private mode */
  }
}

export function createSavedCustomWritingStyle(
  name: string,
  instructions: string,
  userId?: string | null
): { style: SavedCustomWritingStyle | null; error?: string } {
  const normalizedName = normalizeCustomStyleName(name);
  const normalizedInstructions = normalizeCustomStyleInstructions(instructions);
  if (!normalizedName) return { style: null, error: "Enter a name for this style." };
  if (!normalizedInstructions) return { style: null, error: "Add style instructions before saving." };

  const existing = loadSavedCustomWritingStyles(userId);
  const duplicate = existing.find((s) => s.name.toLowerCase() === normalizedName.toLowerCase());
  if (duplicate) {
    return { style: null, error: `A style named "${duplicate.name}" already exists.` };
  }
  if (existing.length >= MAX_SAVED_CUSTOM_WRITING_STYLES) {
    return { style: null, error: `You can save up to ${MAX_SAVED_CUSTOM_WRITING_STYLES} custom styles.` };
  }

  const now = Date.now();
  const style: SavedCustomWritingStyle = {
    id: crypto.randomUUID(),
    name: normalizedName,
    instructions: normalizedInstructions,
    createdAt: now,
    updatedAt: now,
  };
  persistSavedCustomWritingStyles([style, ...existing], userId);
  return { style };
}

export function updateSavedCustomWritingStyle(
  id: string,
  patch: { name?: string; instructions?: string },
  userId?: string | null
): { style: SavedCustomWritingStyle | null; error?: string } {
  const styles = loadSavedCustomWritingStyles(userId);
  const index = styles.findIndex((s) => s.id === id);
  if (index < 0) return { style: null, error: "Saved style not found." };

  const current = styles[index];
  const nextName = patch.name != null ? normalizeCustomStyleName(patch.name) : current.name;
  const nextInstructions =
    patch.instructions != null
      ? normalizeCustomStyleInstructions(patch.instructions)
      : current.instructions;

  if (!nextName) return { style: null, error: "Enter a name for this style." };
  if (!nextInstructions) return { style: null, error: "Add style instructions before saving." };

  const duplicate = styles.find(
    (s) => s.id !== id && s.name.toLowerCase() === nextName.toLowerCase()
  );
  if (duplicate) {
    return { style: null, error: `A style named "${duplicate.name}" already exists.` };
  }

  const updated: SavedCustomWritingStyle = {
    ...current,
    name: nextName,
    instructions: nextInstructions,
    updatedAt: Date.now(),
  };
  const next = [...styles];
  next[index] = updated;
  persistSavedCustomWritingStyles(next, userId);
  return { style: updated };
}

export function deleteSavedCustomWritingStyle(id: string, userId?: string | null): void {
  const styles = loadSavedCustomWritingStyles(userId).filter((s) => s.id !== id);
  persistSavedCustomWritingStyles(styles, userId);
}

export function findSavedCustomWritingStyle(
  id: string | undefined,
  userId?: string | null
): SavedCustomWritingStyle | null {
  if (!id) return null;
  return loadSavedCustomWritingStyles(userId).find((s) => s.id === id) ?? null;
}
