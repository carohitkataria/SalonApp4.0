/**
 * Safely turn any FastAPI/axios error into a renderable string.
 *
 * FastAPI commonly returns `detail` as either:
 *   - a plain string ("User not found")
 *   - a structured object (e.g. { code: "SALON_SUSPENDED", message: "...", reason: "..." })
 *
 * Passing the object straight into toast.error(...) or rendering it as a JSX
 * child crashes React with "Objects are not valid as a React child".
 *
 * Always run untrusted error payloads through this helper before display.
 */
export function extractErrorMessage(error, fallback = 'Something went wrong') {
  if (!error) return fallback;
  const raw = error?.response?.data?.detail ?? error?.response?.data;
  if (typeof raw === 'string') return raw;
  // FastAPI 422 validation errors come back as an ARRAY of {loc, msg, type}.
  if (Array.isArray(raw)) {
    const first = raw[0];
    if (first && typeof first === 'object') return first.msg || first.message || fallback;
    if (typeof first === 'string') return first;
    return fallback;
  }
  if (raw && typeof raw === 'object') {
    return raw.message || raw.detail || raw.error || raw.msg || fallback;
  }
  if (typeof error === 'string') return error;
  return error?.message || fallback;
}

/**
 * For the same payload, return the structured object if there is one, else null.
 * Useful when a caller wants to branch on { code, reason } (e.g. SALON_SUSPENDED).
 */
export function extractErrorDetail(error) {
  const raw = error?.response?.data?.detail;
  return (raw && typeof raw === 'object') ? raw : null;
}
