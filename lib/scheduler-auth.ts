import { createHmac, timingSafeEqual } from "node:crypto";

export const SCHEDULER_SESSION_COOKIE = "tradins_scheduler_session";
const SESSION_TTL_SECONDS = 12 * 60 * 60;

type CookieStoreLike = {
  get: (name: string) => { value: string } | undefined;
};

type SessionPayload = {
  exp: number;
};

function asBase64Url(text: string): string {
  return Buffer.from(text, "utf8").toString("base64url");
}

function fromBase64Url(text: string): string | null {
  try {
    return Buffer.from(text, "base64url").toString("utf8");
  } catch {
    return null;
  }
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function getAuthSecret(): string | null {
  const secret = process.env.SCHEDULER_AUTH_SECRET ?? process.env.TRADINS_API_KEY ?? "";
  const trimmed = secret.trim();
  return trimmed || null;
}

function signPayload(payloadBase64: string, secret: string): string {
  return createHmac("sha256", secret).update(payloadBase64).digest("base64url");
}

function createSessionToken(secret: string): string {
  const payload: SessionPayload = {
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };
  const payloadBase64 = asBase64Url(JSON.stringify(payload));
  const signature = signPayload(payloadBase64, secret);
  return `${payloadBase64}.${signature}`;
}

function verifySessionToken(token: string, secret: string): boolean {
  const [payloadBase64, signature] = token.split(".");
  if (!payloadBase64 || !signature) return false;
  const expected = signPayload(payloadBase64, secret);
  if (!safeEqual(signature, expected)) return false;
  const payloadRaw = fromBase64Url(payloadBase64);
  if (!payloadRaw) return false;
  try {
    const payload = JSON.parse(payloadRaw) as SessionPayload;
    if (!payload.exp || !Number.isFinite(payload.exp)) return false;
    return payload.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

export function isSchedulerAuthConfigured(): boolean {
  const password = process.env.SCHEDULER_ADMIN_PASSWORD ?? "";
  return Boolean(password.trim() && getAuthSecret());
}

export function validateSchedulerPassword(password: string): boolean {
  const configured = process.env.SCHEDULER_ADMIN_PASSWORD ?? "";
  if (!configured) return false;
  return safeEqual(password, configured);
}

export function buildSchedulerSessionCookie() {
  const secret = getAuthSecret();
  if (!secret) return null;
  const token = createSessionToken(secret);
  return {
    name: SCHEDULER_SESSION_COOKIE,
    value: token,
    options: {
      httpOnly: true,
      secure: process.env.NODE_ENV !== "development",
      sameSite: "lax" as const,
      path: "/",
      maxAge: SESSION_TTL_SECONDS,
    },
  };
}

export function clearSchedulerSessionCookie() {
  return {
    name: SCHEDULER_SESSION_COOKIE,
    value: "",
    options: {
      httpOnly: true,
      secure: process.env.NODE_ENV !== "development",
      sameSite: "lax" as const,
      path: "/",
      maxAge: 0,
    },
  };
}

export function isSchedulerAuthenticatedFromCookieValue(token: string | null | undefined): boolean {
  if (!token) return false;
  const secret = getAuthSecret();
  if (!secret) return false;
  return verifySessionToken(token, secret);
}

export function isSchedulerAuthenticated(cookieStore: CookieStoreLike): boolean {
  const token = cookieStore.get(SCHEDULER_SESSION_COOKIE)?.value;
  return isSchedulerAuthenticatedFromCookieValue(token);
}
