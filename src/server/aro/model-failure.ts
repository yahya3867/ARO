/** Only provider availability/auth/budget failures trigger deterministic recovery. */
export function modelUnavailable(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const status = (error as Error & { status?: number }).status;
  if (status && ([401, 402, 403, 408, 429].includes(status) || status >= 500)) return true;
  return /APIConnection|TimeoutError|AbortError/.test(error.name) ||
    /Visitor API key required|insufficient_quota|no credits remaining|exceeded your current quota|OpenRouter key verification unavailable|OpenRouter requires|fetch failed|connection error|timed? out|timeout|ECONNRESET|ECONNREFUSED|ENOTFOUND|ETIMEDOUT/i.test(error.message);
}
