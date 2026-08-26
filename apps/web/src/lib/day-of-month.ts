// Clamp/wrap helper for closingDay/dueDay <input type="number"> fields.
// The browser's spinner arrows fire onChange with the value already
// incremented/decremented past the field's semantic bounds (native
// min/max only stop the arrows on some browsers, not all — Firefox lets
// the value keep climbing past `max` on click-hold). We normalize here so
// 31→32 wraps to 1, and 1→0 wraps to 31, regardless of browser behavior.
export function wrapDayOfMonth(nextValue: string, prevValue: string): string {
  if (nextValue === "") return nextValue;
  const next = Number(nextValue);
  if (!Number.isInteger(next)) return prevValue;
  if (next > 31) return "1";
  if (next < 1) return "31";
  return nextValue;
}
