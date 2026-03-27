/**
 * Title-case a single name part.
 * Preserves already-correct casing (e.g. "McDonald" stays "McDonald").
 * Only transforms all-lowercase or all-uppercase names.
 */
function titleCasePart(s: string): string {
  if (!s) return s;
  // Already mixed case (like "McDonald", "DeVito") — leave it
  const hasUpper = s !== s.toLowerCase();
  const hasLower = s !== s.toUpperCase();
  if (hasUpper && hasLower) return s;
  // All-lowercase or all-uppercase — title-case it
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

/**
 * Build a display name from first/last, applying title-case.
 * Handles compound names like "mary jane" → "Mary Jane".
 */
export function formatContactName(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
  fallback = 'Unknown',
): string {
  const parts = [firstName, lastName].filter(Boolean) as string[];
  if (parts.length === 0) return fallback;
  return parts
    .map((part) => part.split(/(\s+|-)/g).map((seg) => /^[\s-]+$/.test(seg) ? seg : titleCasePart(seg)).join(''))
    .join(' ');
}
