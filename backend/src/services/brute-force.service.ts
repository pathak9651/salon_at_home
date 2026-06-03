import { prisma } from "../config/prisma";

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_LOCK_MS = 10 * 60 * 1000;
const LOGIN_MAX_FAILURES = 3;

const CODE_WINDOW_MS = 10 * 60 * 1000;
const CODE_LOCK_MS = 20 * 60 * 1000;
const CODE_MAX_FAILURES = 5;

function now() {
  return Date.now();
}

function normalizeKey(value: string) {
  return value.trim().toLowerCase();
}

async function pruneExpired(key: string, record: { firstAttemptAt: Date; lockedUntil?: Date | null }, windowMs: number) {
  const current = now();
  if (record.lockedUntil && record.lockedUntil.getTime() > current) return record;
  if (current - record.firstAttemptAt.getTime() <= windowMs) return record;
  await prisma.securityAttempt.delete({ where: { key } }).catch(() => undefined);
  return null;
}

async function assertNotBlocked(key: string, windowMs: number) {
  const record = await prisma.securityAttempt.findUnique({ where: { key } });
  if (!record) return;
  const activeRecord = await pruneExpired(key, record, windowMs);
  if (activeRecord?.lockedUntil && activeRecord.lockedUntil.getTime() > now()) {
    const retryAfterSeconds = Math.ceil((activeRecord.lockedUntil.getTime() - now()) / 1000);
    const error = new Error("Too many failed attempts. Try again later.") as Error & { retryAfterSeconds?: number };
    error.retryAfterSeconds = retryAfterSeconds;
    throw error;
  }
}

async function recordFailure(key: string, windowMs: number, maxFailures: number, lockMs: number) {
  const current = now();
  const existing = await prisma.securityAttempt.findUnique({ where: { key } });
  const count = existing && current - existing.firstAttemptAt.getTime() <= windowMs ? existing.count + 1 : 1;
  await prisma.securityAttempt.upsert({
    where: { key },
    update: {
      count,
      firstAttemptAt: count === 1 ? new Date(current) : undefined,
      lockedUntil: count >= maxFailures ? new Date(current + lockMs) : null,
    },
    create: {
      key,
      count,
      firstAttemptAt: new Date(current),
      lockedUntil: count >= maxFailures ? new Date(current + lockMs) : null,
    },
  });
}

async function clear(key: string) {
  await prisma.securityAttempt.delete({ where: { key } }).catch(() => undefined);
}

export function loginAttemptKey(identifier: string, ip?: string) {
  return `login:${normalizeKey(identifier)}:${ip ?? "unknown"}`;
}

export function codeAttemptKey(purpose: "verify" | "reset", identifier: string, ip?: string) {
  return `code:${purpose}:${normalizeKey(identifier)}:${ip ?? "unknown"}`;
}

export async function assertLoginNotBlocked(key: string) {
  await assertNotBlocked(key, LOGIN_WINDOW_MS);
}

export async function recordLoginFailure(key: string) {
  await recordFailure(key, LOGIN_WINDOW_MS, LOGIN_MAX_FAILURES, LOGIN_LOCK_MS);
}

export async function clearLoginFailures(key: string) {
  await clear(key);
}

export async function assertCodeNotBlocked(key: string) {
  await assertNotBlocked(key, CODE_WINDOW_MS);
}

export async function recordCodeFailure(key: string) {
  await recordFailure(key, CODE_WINDOW_MS, CODE_MAX_FAILURES, CODE_LOCK_MS);
}

export async function clearCodeFailures(key: string) {
  await clear(key);
}
