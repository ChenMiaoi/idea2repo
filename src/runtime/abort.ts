export function throwIfAborted(signal: AbortSignal | undefined): void {
  if (!signal?.aborted) return;
  throw abortError(signal);
}

export function abortError(signal: AbortSignal): Error {
  return signal.reason instanceof Error ? signal.reason : new Error(signal.reason ? String(signal.reason) : "operation cancelled");
}

export function signalWithTimeout(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  if (!signal) return timeout;
  if (signal.aborted) return signal;
  const controller = new AbortController();
  const abortFromSignal = (source: AbortSignal): void => {
    if (!controller.signal.aborted) controller.abort(source.reason);
  };
  signal.addEventListener("abort", () => abortFromSignal(signal), { once: true });
  timeout.addEventListener("abort", () => abortFromSignal(timeout), { once: true });
  return controller.signal;
}

export async function sleepWithSignal(ms: number, signal: AbortSignal | undefined): Promise<void> {
  throwIfAborted(signal);
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(resolve, ms);
    const abort = (): void => {
      clearTimeout(timeout);
      reject(abortError(signal!));
    };
    signal?.addEventListener("abort", abort, { once: true });
  });
}
