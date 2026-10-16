// Q18: v1 normalization — lowercase + trim, no fuzzy matching, no unit conversion.
export function normalizeTitle(title: string): string {
  return title.toLowerCase().trim().replace(/\s+/g, " ");
}

export function normalizeStore(store: string | null | undefined): string | null {
  if (!store) return null;
  const norm = store.toLowerCase().trim().replace(/\s+/g, " ");
  return norm.length > 0 ? norm : null;
}
