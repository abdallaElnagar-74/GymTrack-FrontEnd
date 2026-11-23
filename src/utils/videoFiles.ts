import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

/**
 * Uploaded videos are copied into the app's own storage, so they keep working even if
 * the original is deleted from the gallery. The database stores only the file name
 * (the app's folder path can change after updates on iOS).
 */
const DIR = 'exercise-videos';

export const canStoreVideoFiles = Platform.OS !== 'web';

function dir() {
  const d = new Directory(Paths.document, DIR);
  d.create({ idempotent: true, intermediates: true });
  return d;
}

export async function saveVideoFile(sourceUri: string, originalName?: string | null) {
  const ext = (originalName ?? sourceUri).match(/\.([A-Za-z0-9]{2,5})(?:\?|$)/)?.[1]?.toLowerCase() ?? 'mp4';
  const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const target = new File(dir(), name);
  await new File(sourceUri).copy(target);
  return name;
}

/** The stored video file, or null if it isn't on this phone (e.g. it was added on another device). */
export function videoFile(name: string): File | null {
  if (!canStoreVideoFiles || !name) return null;
  try {
    const f = new File(Paths.document, DIR, name);
    return f.exists ? f : null;
  } catch {
    return null;
  }
}

export function deleteVideoFile(name: string) {
  try {
    videoFile(name)?.delete();
  } catch {
    // already gone
  }
}
