export interface Annotation {
  id: string;
  page: number;
  text: string;
}
export interface ReadingState {
  page: number;
  annotations: Annotation[];
  version: number;
}
export const BOOKMARK_MARKER = "[rpgbay:bookmark:v1]";
/** A conflict requires user action. Merge preserves both concurrent texts instead of overwriting. */
export function mergeReadingStates(
  base: ReadingState,
  local: ReadingState,
  remote: ReadingState,
  makeId: () => string = () => crypto.randomUUID(),
): ReadingState {
  const merged = new Map(remote.annotations.map((a) => [a.id, { ...a }]));
  const baseMap = new Map(base.annotations.map((a) => [a.id, a]));
  const localIds = new Set(local.annotations.map((a) => a.id));
  for (const annotation of local.annotations) {
    const old = baseMap.get(annotation.id),
      theirs = merged.get(annotation.id);
    if (!old) {
      if (!theirs) merged.set(annotation.id, { ...annotation });
      else if (
        theirs.text !== annotation.text ||
        theirs.page !== annotation.page
      ) {
        const id = makeId();
        merged.set(id, { ...annotation, id });
      }
    } else if (annotation.text !== old.text || annotation.page !== old.page) {
      if (!theirs || (theirs.text === old.text && theirs.page === old.page))
        merged.set(annotation.id, { ...annotation });
      else if (
        theirs.text !== annotation.text ||
        theirs.page !== annotation.page
      ) {
        const id = makeId();
        merged.set(id, { ...annotation, id });
      }
    }
  }
  for (const [id, annotation] of baseMap) {
    const theirs = merged.get(id);
    if (
      !localIds.has(id) &&
      theirs?.text === annotation.text &&
      theirs.page === annotation.page
    )
      merged.delete(id);
  }
  return {
    page: local.page,
    annotations: [...merged.values()].sort((a, b) => a.page - b.page),
    version: remote.version,
  };
}
