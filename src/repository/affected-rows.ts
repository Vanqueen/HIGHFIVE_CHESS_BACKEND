export function hasAffectedRows(result: unknown): boolean {
  if (Array.isArray(result)) return result.length > 0;
  return result !== null && result !== undefined && result !== false;
}
