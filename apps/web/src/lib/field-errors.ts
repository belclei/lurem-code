// apps/web/src/lib/field-errors.ts
// Maps an ApiError's `details` (backend's per-field validation.failed list)
// to a `{ field: message }` record, so forms can highlight the offending
// input instead of only showing a generic banner.
import { ApiError } from "../auth/api-client";

export function fieldErrorsFrom(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError) || !error.details) return {};
  const map: Record<string, string> = {};
  for (const detail of error.details) map[detail.field] = detail.message;
  return map;
}
