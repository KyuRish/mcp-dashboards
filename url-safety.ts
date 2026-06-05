import * as dns from "node:dns/promises";
import ipaddr from "ipaddr.js";

/**
 * URL safety validation for outbound HTTP fetches (poll_http, render_from_url).
 *
 * Blocks SSRF attacks where a prompt-injected AI might be coerced into making
 * requests to internal services - cloud metadata endpoints (AWS 169.254.169.254),
 * RFC 1918 private networks, loopback, link-local, etc.
 *
 * Strategy:
 *   1. Reject non-http(s) schemes and credentialed URLs (user:pass@host).
 *   2. Resolve the hostname to its IP(s) via DNS.
 *   3. Reject if ANY resolved address is in a non-unicast range
 *      (private, loopback, link-local, multicast, broadcast, reserved, etc.).
 *   4. Normalize IPv6-mapped-IPv4 (::ffff:127.0.0.1) before checking.
 *
 * Override via MCP_URL_ALLOWLIST=host1.com,host2.com (comma-separated
 * hostnames). Allowlist still resolves DNS but skips the range check, for
 * users who legitimately need to poll an internal endpoint by hostname.
 *
 * NOT addressed by this layer: DNS rebinding (host resolves to public IP at
 * check time, then to private IP at fetch time). The race window is small
 * but real. A full mitigation needs a custom http.Agent that pins the
 * resolved IP. Deferred to keep this fix minimal; document the residual risk.
 */

export class UrlSafetyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UrlSafetyError";
  }
}

function getAllowlist(): Set<string> {
  return new Set(
    (process.env.MCP_URL_ALLOWLIST ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

/** Throws UrlSafetyError if the URL should not be fetched. */
export async function assertSafeUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new UrlSafetyError(`Malformed URL: ${rawUrl}`);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UrlSafetyError(`URL scheme not allowed: ${url.protocol} (only http: and https: are permitted)`);
  }

  if (url.username || url.password) {
    throw new UrlSafetyError("URL must not contain credentials (user:password@). Use the headers argument or a server-side preset instead.");
  }

  const hostname = url.hostname.toLowerCase();
  if (!hostname) {
    throw new UrlSafetyError("URL missing hostname");
  }

  // Explicit allowlist bypasses the IP range check.
  if (getAllowlist().has(hostname)) {
    return url;
  }

  // Resolve and validate every IP returned.
  let addresses: { address: string; family: number }[];
  try {
    addresses = await dns.lookup(hostname, { all: true });
  } catch (err: any) {
    throw new UrlSafetyError(`DNS lookup failed for ${hostname}: ${err.code ?? err.message}`);
  }

  if (addresses.length === 0) {
    throw new UrlSafetyError(`DNS returned no addresses for ${hostname}`);
  }

  for (const { address } of addresses) {
    let parsed: ipaddr.IPv4 | ipaddr.IPv6;
    try {
      parsed = ipaddr.parse(address);
    } catch {
      throw new UrlSafetyError(`Failed to parse resolved IP ${address} for ${hostname}`);
    }

    // Normalize IPv6-mapped IPv4 so e.g. ::ffff:169.254.169.254 is caught.
    if (parsed.kind() === "ipv6") {
      const v6 = parsed as ipaddr.IPv6;
      if (v6.isIPv4MappedAddress()) {
        parsed = v6.toIPv4Address();
      }
    }

    const range = parsed.range();
    // Block everything that isn't a normal globally-routable unicast address.
    if (range !== "unicast") {
      throw new UrlSafetyError(
        `Refusing to fetch ${hostname}: resolved address ${address} is in non-public range "${range}". ` +
        `Set MCP_URL_ALLOWLIST=${hostname} if this is intentional.`,
      );
    }
  }

  return url;
}

/**
 * Per-hostname sliding-window rate limiter to throttle outbound HTTP from
 * poll_http and render_from_url. Protects external APIs from abuse and
 * prevents the user's IP getting banned if a prompt-injected AI tries to
 * hammer a target.
 *
 * Algorithm: each call reserves a "slot" on a per-host timeline. The
 * earliest possible slot is now - (BURST-1) * interval, so the first BURST
 * calls execute immediately. Subsequent calls schedule into the future at
 * `interval` apart, and await until their slot. Reservations are recorded
 * synchronously BEFORE the await, so 100 concurrent callers each get a
 * distinct slot and serialize correctly (unlike a snapshot-only token
 * bucket where concurrent callers all see the same depleted state and fire
 * their setTimeouts in parallel).
 *
 * Defaults: 10 req/sec sustained, burst of 20, max wait 5s before erroring.
 * Override via MCP_OUTBOUND_RATE_PER_SEC and MCP_OUTBOUND_BURST env vars.
 */
const _OUTBOUND_RATE = Math.max(1, Number(process.env.MCP_OUTBOUND_RATE_PER_SEC) || 10);
const _OUTBOUND_BURST = Math.max(1, Number(process.env.MCP_OUTBOUND_BURST) || 20);
const _OUTBOUND_MAX_WAIT_MS = 5000;
const _OUTBOUND_INTERVAL_MS = 1000 / _OUTBOUND_RATE;
const _nextSlot = new Map<string, number>();

export async function acquireOutbound(hostname: string): Promise<void> {
  const key = hostname.toLowerCase();
  const now = Date.now();
  const prev = _nextSlot.get(key) ?? 0;
  // Burst allowance: a host that hasn't been called in a while can fire
  // BURST requests immediately. earliestPossible is set so the first call
  // after a quiet period schedules into a slot that's already in the past.
  const earliestPossible = now - (_OUTBOUND_BURST - 1) * _OUTBOUND_INTERVAL_MS;
  const mySlot = Math.max(earliestPossible, prev);
  const waitMs = Math.max(0, mySlot - now);

  if (waitMs > _OUTBOUND_MAX_WAIT_MS) {
    throw new UrlSafetyError(
      `Outbound rate limit exceeded for ${key} (would wait ${Math.round(waitMs)}ms > max ${_OUTBOUND_MAX_WAIT_MS}ms). ` +
      `Adjust MCP_OUTBOUND_RATE_PER_SEC if this is a legitimate workload.`,
    );
  }

  // Reserve the next slot synchronously BEFORE awaiting, so concurrent
  // callers each see an advanced _nextSlot and serialize.
  _nextSlot.set(key, mySlot + _OUTBOUND_INTERVAL_MS);

  if (waitMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
}
