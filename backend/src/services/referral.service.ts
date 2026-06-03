import crypto from "node:crypto";
import { prisma } from "../config/prisma";

function referralSeed(name: string | null | undefined, phone: string, salt = 0) {
  return `${(name ?? "USER").trim().toUpperCase()}|${phone.trim()}|${salt}`;
}

function sixDigitCode(seed: string) {
  const hex = crypto.createHash("sha256").update(seed).digest("hex").slice(0, 12);
  const number = Number.parseInt(hex, 16) % 1_000_000;
  return String(number).padStart(6, "0");
}

export async function generateUniqueReferralCode(name: string | null | undefined, phone: string, userId?: string) {
  for (let salt = 0; salt < 100; salt += 1) {
    const referralCode = sixDigitCode(referralSeed(name, phone, salt));
    const existing = await prisma.user.findUnique({ where: { referralCode }, select: { id: true } });
    if (!existing || existing.id === userId) return referralCode;
  }
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function ensureReferralCode(user: { id: string; name?: string | null; phone: string; referralCode?: string | null }) {
  if (user.referralCode) return user.referralCode;
  const referralCode = await generateUniqueReferralCode(user.name, user.phone, user.id);
  await prisma.user.update({ where: { id: user.id }, data: { referralCode } });
  return referralCode;
}
