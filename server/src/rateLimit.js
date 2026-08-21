export function rateLimiter({ windowMs = 15 * 60 * 1000, max = 5 } = {}) {
  const attempts = new Map();

  function prune(now) {
    if (attempts.size < 5000) return;
    for (const [key, rec] of attempts) {
      if (now >= rec.resetAt) attempts.delete(key);
    }
  }

  return {
    check(key) {
      const now = Date.now();
      prune(now);
      const rec = attempts.get(key);
      if (!rec || now >= rec.resetAt) return { allowed: true, retryAfterMs: 0 };
      return { allowed: rec.count < max, retryAfterMs: rec.resetAt - now };
    },
    fail(key) {
      const now = Date.now();
      const rec = attempts.get(key);
      if (rec && now < rec.resetAt) {
        rec.count += 1;
        return;
      }
      attempts.set(key, { count: 1, resetAt: now + windowMs });
    },
    reset(key) {
      attempts.delete(key);
    },
  };
}
