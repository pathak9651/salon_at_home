import { User, UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";
import { Router } from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { env } from "../../config/env";
import { prisma } from "../../config/prisma";
import { requireAuth } from "../../middleware/auth.middleware";
import { authLimiter, loginLimiter, otpLimiter } from "../../middleware/rate-limit.middleware";
import {
  assertCodeNotBlocked,
  assertLoginNotBlocked,
  clearCodeFailures,
  clearLoginFailures,
  codeAttemptKey,
  loginAttemptKey,
  recordCodeFailure,
  recordLoginFailure,
} from "../../services/brute-force.service";
import { sendAuthCode } from "../../services/mail.service";
import { ensureReferralCode, generateUniqueReferralCode } from "../../services/referral.service";
import { asyncHandler } from "../../utils/async-handler";
import { HttpError } from "../../utils/http-error";

const router = Router();
const CODE_TTL_MS = 10 * 60 * 1000;
const passwordSchema = z.string()
  .min(8, "Password must be at least 8 characters")
  .max(72, "Password must be 72 characters or less")
  .regex(/[A-Za-z]/, "Password must include a letter")
  .regex(/\d/, "Password must include a number");
const emailSchema = z.string().trim().email().transform((email) => email.toLowerCase());
const phoneSchema = z.string().trim().regex(/^\+?[0-9]{10,15}$/, "Phone must be 10 to 15 digits");

function publicUser(user: User) {
  const { password: _password, verificationCodeHash: _verification, resetCodeHash: _reset, ...safeUser } = user;
  return safeUser;
}

function createToken(user: User) {
  return jwt.sign({ role: user.role, sessionVersion: user.sessionVersion }, env.JWT_SECRET, {
    subject: user.id,
    expiresIn: "7d",
  });
}

function createCode() {
  return env.OTP_BYPASS_CODE ?? String(Math.floor(100000 + Math.random() * 900000));
}

async function hashCode(code: string) {
  return bcrypt.hash(code, 10);
}

async function trySendAuthCode(email: string, code: string, purpose: "verify" | "reset") {
  try {
    await sendAuthCode(email, code, purpose);
    return true;
  } catch (error) {
    console.error(`Auth ${purpose} email failed for ${email}`, error);
    return false;
  }
}

router.use(["/signup", "/login"], authLimiter);
router.use("/login", loginLimiter);
router.use(["/verify-account", "/resend-verification", "/forgot-password", "/reset-password"], otpLimiter);

router.post("/signup", asyncHandler(async (req, res) => {
  const data = z.object({
    name: z.string().trim().min(2).max(80),
    email: emailSchema,
    phone: phoneSchema,
    password: passwordSchema,
    accountType: z.enum(["CLIENT", "MERCHANT"]),
  }).parse(req.body);
  const existingUser = await prisma.user.findFirst({ where: { deletedAt: null, OR: [{ email: data.email }, { phone: data.phone }] } });
  if (existingUser) throw new HttpError(409, "An account with this email or phone already exists");

  const code = createCode();
  const referralCode = await generateUniqueReferralCode(data.name, data.phone);
  await prisma.user.create({
    data: {
      name: data.name,
      email: data.email,
      phone: data.phone,
      referralCode,
      password: await bcrypt.hash(data.password, 12),
      role: data.accountType === "MERCHANT" ? UserRole.OWNER : UserRole.CLIENT,
      verificationCodeHash: await hashCode(code),
      verificationExpiresAt: new Date(Date.now() + CODE_TTL_MS),
    },
  });
  const emailSent = await trySendAuthCode(data.email, code, "verify");
  if (!emailSent) {
    return res.status(202).json({
      message: "Account created, but the verification email could not be sent. Please try resending the code in a moment.",
      email: data.email,
    });
  }
  res.status(201).json({ message: "Account created. Verify your email to continue.", email: data.email });
}));

router.post("/verify-account", asyncHandler(async (req, res) => {
  const data = z.object({ email: emailSchema, code: z.string().regex(/^\d{6}$/, "Code must be 6 digits") }).parse(req.body);
  const attemptKey = codeAttemptKey("verify", data.email, req.ip);
  try {
    await assertCodeNotBlocked(attemptKey);
  } catch (error) {
    const retryAfterSeconds = error instanceof Error && "retryAfterSeconds" in error ? Number(error.retryAfterSeconds) : 60;
    res.setHeader("Retry-After", retryAfterSeconds);
    throw new HttpError(429, "Too many failed verification attempts. Try again later.");
  }
  const user = await prisma.user.findFirst({ where: { email: data.email, deletedAt: null } });
  if (!user?.verificationCodeHash || !user.verificationExpiresAt || user.verificationExpiresAt < new Date() || !(await bcrypt.compare(data.code, user.verificationCodeHash))) {
    await recordCodeFailure(attemptKey);
    throw new HttpError(400, "Invalid or expired verification code");
  }
  const verifiedUser = await prisma.user.update({
    where: { id: user.id },
    data: { emailVerified: true, verificationCodeHash: null, verificationExpiresAt: null },
  });
  await ensureReferralCode(verifiedUser);
  await clearCodeFailures(attemptKey);
  res.json({ token: createToken(verifiedUser), user: publicUser(verifiedUser) });
}));

router.post("/resend-verification", asyncHandler(async (req, res) => {
  const { email } = z.object({ email: emailSchema }).parse(req.body);
  const user = await prisma.user.findFirst({ where: { email, deletedAt: null } });
  if (!user || user.emailVerified) return res.json({ message: "If verification is required, a code has been sent." });
  const code = createCode();
  await prisma.user.update({ where: { id: user.id }, data: { verificationCodeHash: await hashCode(code), verificationExpiresAt: new Date(Date.now() + CODE_TTL_MS) } });
  if (!(await trySendAuthCode(email, code, "verify"))) {
    throw new HttpError(503, "Verification email could not be sent. Please try again later.");
  }
  res.json({ message: "Verification code sent." });
}));

router.post("/login", asyncHandler(async (req, res) => {
  const data = z.object({ identifier: z.string().trim().min(3), password: z.string().min(1) }).parse(req.body);
  const identifier = data.identifier.toLowerCase();
  const attemptKey = loginAttemptKey(identifier, req.ip);
  try {
    await assertLoginNotBlocked(attemptKey);
  } catch (error) {
    const retryAfterSeconds = error instanceof Error && "retryAfterSeconds" in error ? Number(error.retryAfterSeconds) : 60;
    res.setHeader("Retry-After", retryAfterSeconds);
    throw new HttpError(429, "Too many failed login attempts. Try again later.");
  }
  const user = await prisma.user.findFirst({ where: { deletedAt: null, OR: [{ email: identifier }, { phone: data.identifier }] } });
  if (!user?.password || !(await bcrypt.compare(data.password, user.password))) {
    await recordLoginFailure(attemptKey);
    throw new HttpError(401, "Invalid email, phone, or password");
  }
  if (user.isSuspended) throw new HttpError(403, "Account suspended. Contact support.");
  if (!user.emailVerified && user.role !== UserRole.ADMIN) {
    return res.status(403).json({ error: "Verify your email before logging in", action: "VERIFY_ACCOUNT", email: user.email });
  }
  await ensureReferralCode(user);
  await clearLoginFailures(attemptKey);
  res.json({ token: createToken(user), user: publicUser(user) });
}));

router.post("/forgot-password", asyncHandler(async (req, res) => {
  const { identifier } = z.object({ identifier: z.string().trim().min(3) }).parse(req.body);
  const normalized = identifier.toLowerCase();
  const user = await prisma.user.findFirst({ where: { deletedAt: null, OR: [{ email: normalized }, { phone: identifier }] } });
  if (!user?.email) return res.json({ message: "If the account exists, a reset code has been sent." });
  const code = createCode();
  await prisma.user.update({ where: { id: user.id }, data: { resetCodeHash: await hashCode(code), resetExpiresAt: new Date(Date.now() + CODE_TTL_MS) } });
  if (!(await trySendAuthCode(user.email, code, "reset"))) {
    throw new HttpError(503, "Password reset email could not be sent. Please try again later.");
  }
  res.json({ message: "If the account exists, a reset code has been sent.", email: user.email });
}));

router.post("/reset-password", asyncHandler(async (req, res) => {
  const data = z.object({ email: emailSchema, code: z.string().regex(/^\d{6}$/, "Code must be 6 digits"), password: passwordSchema }).parse(req.body);
  const attemptKey = codeAttemptKey("reset", data.email, req.ip);
  try {
    await assertCodeNotBlocked(attemptKey);
  } catch (error) {
    const retryAfterSeconds = error instanceof Error && "retryAfterSeconds" in error ? Number(error.retryAfterSeconds) : 60;
    res.setHeader("Retry-After", retryAfterSeconds);
    throw new HttpError(429, "Too many failed reset attempts. Try again later.");
  }
  const user = await prisma.user.findFirst({ where: { email: data.email, deletedAt: null } });
  if (!user?.resetCodeHash || !user.resetExpiresAt || user.resetExpiresAt < new Date() || !(await bcrypt.compare(data.code, user.resetCodeHash))) {
    await recordCodeFailure(attemptKey);
    throw new HttpError(400, "Invalid or expired reset code");
  }
  await prisma.user.update({ where: { id: user.id }, data: { password: await bcrypt.hash(data.password, 12), resetCodeHash: null, resetExpiresAt: null, sessionVersion: { increment: 1 } } });
  await clearCodeFailures(attemptKey);
  res.json({ message: "Password reset successful. You can log in now." });
}));

router.post("/logout", requireAuth, asyncHandler(async (req, res) => {
  await prisma.user.update({ where: { id: req.user!.id }, data: { sessionVersion: { increment: 1 } } });
  res.json({ message: "Logged out" });
}));

router.get("/me", requireAuth, asyncHandler(async (req, res) => {
  const user = await prisma.user.findFirst({ where: { id: req.user!.id, deletedAt: null } });
  if (!user) throw new HttpError(404, "User not found");
  await ensureReferralCode(user);
  res.json(publicUser(user));
}));

export default router;
