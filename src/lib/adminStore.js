import { useCallback, useEffect, useRef, useState } from "react";
import { adminCall } from "@/lib/adminApi";

/**
 * One small shared store for the admin screens. Loading the same thing twice
 * inside half a minute reads the cache instead of the database, so opening
 * Overview and Projects costs one request rather than one each.
 */
export const ADMIN_FRESH_MS = 30000;

const cache = new Map();

export function invalidateAdmin(prefix = "") {
  for (const key of [...cache.keys()]) {
    if (!prefix || key.startsWith(prefix)) cache.delete(key);
  }
}

export function useAdminResource(action, payload = {}, enabled = true) {
  const key = `${action}:${JSON.stringify(payload)}`;
  const keyRef = useRef(key);
  keyRef.current = key;

  const [data, setData] = useState(() => cache.get(key)?.data ?? null);
  const [loading, setLoading] = useState(() => !cache.has(key));
  const [error, setError] = useState("");

  const load = useCallback(
    async (force = false) => {
      const hit = cache.get(key);
      if (!force && hit && Date.now() - hit.at < ADMIN_FRESH_MS) {
        setData(hit.data);
        setLoading(false);
        return;
      }
      setLoading(true);
      setError("");
      try {
        const fresh = await adminCall(action, payload);
        cache.set(key, { at: Date.now(), data: fresh });
        if (keyRef.current === key) setData(fresh);
      } catch (err) {
        if (err?.name === "AdminAuthError") return;
        if (keyRef.current === key) setError(err?.message || "This could not be loaded.");
      } finally {
        if (keyRef.current === key) setLoading(false);
      }
    },
    [action, key]
  );

  useEffect(() => {
    if (enabled) load(false);
  }, [enabled, load]);

  // Refreshing is allowed, but never more often than the cache window.
  useEffect(() => {
    if (!enabled) return undefined;
    const id = setInterval(() => load(false), ADMIN_FRESH_MS);
    return () => clearInterval(id);
  }, [enabled, load]);

  return { data, loading, error, reload: () => load(true) };
}