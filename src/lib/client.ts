// Tiny client-side fetch helpers used by the React pages.

// If a session expires mid-use, any API call 401s — bounce to the landing page.
function handleUnauthorized(status: number) {
  if (status === 401 && typeof window !== "undefined" && window.location.pathname !== "/") {
    window.location.href = "/?next=" + encodeURIComponent(window.location.pathname);
  }
}

export async function getJSON<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    handleUnauthorized(res.status);
    throw new Error((await res.json().catch(() => ({}))).error ?? `Request failed (${res.status})`);
  }
  return res.json();
}

export async function sendJSON<T>(url: string, method: "POST" | "PUT" | "PATCH" | "DELETE", body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    handleUnauthorized(res.status);
    throw new Error((await res.json().catch(() => ({}))).error ?? `Request failed (${res.status})`);
  }
  return res.json();
}
