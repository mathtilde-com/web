export type SaveResult =
  | { status: "saved"; id: string }
  | { status: "unauthenticated" }
  | { status: "failed" };

type Res = { status: number; json: () => Promise<unknown> };

// Retries only network errors and 5xx; 4xx (invalid, rate-limited) can never succeed.
export async function saveWithRetry(
  send: () => Promise<Res>,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<SaveResult> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await send();
      if (res.status === 201) return { status: "saved", id: ((await res.json()) as { id: string }).id };
      if (res.status === 204) return { status: "unauthenticated" };
      if (res.status < 500) return { status: "failed" };
    } catch { /* network error: retry */ }
    if (attempt === 0) await sleep(1000);
  }
  return { status: "failed" };
}
