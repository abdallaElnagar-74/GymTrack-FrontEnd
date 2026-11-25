import type { SetKind, Technique } from '../db/queries';
import { isRTL, t } from '../i18n';

/** Techniques every account has; they match the warm-up / drop set types of a set. */
export const BUILTIN_TECHNIQUES = ['warmup', 'drop'] as const;
export const isBuiltin = (id: string) => (BUILTIN_TECHNIQUES as readonly string[]).includes(id);

/** Name to show: built-ins are translated, the user's own are shown as typed. */
export function techniqueName(tq: Pick<Technique, 'id' | 'name'>) {
  if (tq.id === 'warmup') return t('Warm-up');
  if (tq.id === 'drop') return t('Drop set');
  return tq.name;
}

/** Name inside the sentence "Note: this exercise includes …". */
function noteName(tq: Technique) {
  if (tq.id === 'warmup') return t('a warm-up set');
  if (tq.id === 'drop') return t('a drop set');
  return tq.name;
}

/**
 * Techniques of an exercise, in the order of the account's list: the ones ticked on the exercise,
 * plus "Drop set" when its sets (planned or in the workout) include a drop set.
 */
export function exerciseTechniques(all: Technique[], ids: string[] | undefined, sets: { kind?: SetKind }[] = []) {
  const used = new Set(ids ?? []);
  if (sets.some((s) => s.kind === 'drop')) used.add('drop');
  return all.filter((tq) => used.has(tq.id));
}

/** "Note: this exercise includes a drop set, Rest-pause" ('' if none). */
export function techniqueNote(list: Technique[]) {
  if (!list.length) return '';
  return t('Note: this exercise includes {names}', { names: list.map(noteName).join(isRTL ? '، ' : ', ') });
}

/** Video for a set of this type: the warm-up / drop-set technique's, else a link left on the set. */
export function setVideo(all: Technique[], kind: SetKind | undefined, setLink?: string) {
  return all.find((tq) => tq.id === kind && isBuiltin(tq.id))?.link || setLink || '';
}

let n = 0;
/** Id for a new technique (letters/digits only, as the server requires). */
export const newTechniqueId = () => `t${Date.now().toString(36)}${(n++).toString(36)}`;
