import { User, UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { env } from "../../config/env";
import { prisma } from "../../config/prisma";
import { requireAuth } from "../../middleware/auth.middleware";
import { sendAuthCode } from "../../services/mail.service";
import { asyncHandler } from "../../utils/async-handler";
import { HttpError } from "../../utils/http-error";

const router = Router();
const CODE_TTL_MS = 10 * 60 * 1000;
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 25, standardHeaders: true, legacyHeaders: false });
const codeLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 8, standardHeaders: true, legacyHeaders: false });
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

function devCode(code: string) {
  return env.OTP_BYPASS_CODE ? { devCode: code } : {};
}

router.use(["/signup", "/login"], authLimiter);
router.use(["/verify-account", "/resend-verification", "/forgot-password", "/reset-password"], codeLimiter);

router.post("/signup", asyncHandler(async (req, res) => {
  const data = z.object({
    name: z.string().trim().min(2).max(80),
    email: emailSchema,
    phone: phoneSchema,
    password: passwordSchema,
    accountType: z.enum(["CLIENT", "MERCHANT"]),
  }).parse(req.body);
  const existingUser = await prisma.user.findFirst({ where: { OR: [{ email: data.email }, { phone: data.phone }] } });
  if (existingUser) throw new HttpError(409, "An account with this email or phone already exists");

  const code = createCode();
  await prisma.user.create({
    data: {
      name: data.name,
      email: data.email,
      phone: data.phone,
      password: await bcrypt.hash(data.password, 12),
      role: data.accountType === "MERCHANT" ? UserRole.OWNER : UserRole.CLIENT,
      verificationCodeHash: await hashCode(code),
      verificationExpiresAt: new Date(Date.now() + CODE_TTL_MS),
    },
  });
  await sendAuthCode(data.email, code, "verify");
  res.status(201).json({ message: "Account created. Verify your email to continue.", email: data.email, ...devCode(code) });
}));

router.post("/verify-account", asyncHandler(async (req, res) => {
  const data = z.object({ email: emailSchema, code: z.string().regex(/^\d{6}$/, "Code must be 6 digits") }).parse(req.body);
  const user = await prisma.user.findUnique({ where: { email: data.email } });
  if (!user?.verificationCodeHash || !user.verificationExpiresAt || user.verificationExpiresAt < new Date() || !(await bcrypt.compare(data.code, user.verificationCodeHash))) {
    throw new HttpError(400, "Invalid or expired verification code");
  }
  const verifiedUser = await prisma.user.update({
    where: { id: user.id },
    data: { emailVerified: true, verificationCodeHash: null, verificationExpiresAt: null },
  });
  res.json({ token: createToken(verifiedUser), user: publicUser(verifiedUser) });
}));

router.post("/resend-verification", asyncHandler(async (req, res) => {
  const { email } = z.object({ email: emailSchema }).parse(req.body);
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.emailVerified) return res.json({ message: "If verification is required, a code has been sent." });
  const code = createCode();
  await prisma.user.update({ where: { id: user.id }, data: { verificationCodeHash: await hashCode(code), verificationExpiresAt: new Date(Date.now() + CODE_TTL_MS) } });
  await sendAuthCode(email, code, "verify");
  res.json({ message: "Verification code sent.", ...devCode(code) });
}));

router.post("/login", asyncHandler(async (req, res) => {
  const data = z.object({ identifier: z.string().trim().min(3), password: z.string().min(1) }).parse(req.body);
  const identifier = data.identifier.toLowerCase();
  const user = await prisma.user.findFirst({ where: { OR: [{ email: identifier }, { phone: data.identifier }] } });
  if (!user?.password || !(await bcrypt.compare(data.password, user.password))) throw new HttpError(401, "Invalid email, phone, or password");
  if (user.isSuspended) throw new HttpError(403, "Account suspended. Contact support.");
  if (!user.emailVerified && user.role !== UserRole.ADMIN) {
    return res.status(403).json({ error: "Verify your email before logging in", action: "VERIFY_ACCOUNT", email: user.email });
  }
  res.json({ token: createToken(user), user: publicUser(user) });
}));

router.post("/forgot-password", asyncHandler(async (req, res) => {
  const { identifier } = z.object({ identifier: z.string().trim().min(3) }).parse(req.body);
  const normalized = identifier.toLowerCase();
  const user = await prisma.user.findFirst({ where: { OR: [{ email: normalized }, { phone: identifier }] } });
  if (!user?.email) return res.json({ message: "If the account exists, a reset code has been sent." });
  const code = createCode();
  await prisma.user.update({ where: { id: user.id }, data: { resetCodeHash: await hashCode(code), resetExpiresAt: new Date(Date.now() + CODE_TTL_MS) } });
  await sendAuthCode(user.email, code, "reset");
  res.json({ message: "If the account exists, a reset code has been sent.", email: user.email, ...devCode(code) });
}));

router.post("/reset-password", asyncHandler(async (req, res) => {
  const data = z.object({ email: emailSchema, code: z.string().regex(/^\d{6}$/, "Code must be 6 digits"), password: passwordSchema }).parse(req.body);
  const user = await prisma.user.findUnique({ where: { email: data.email } });
  if (!user?.resetCodeHash || !user.resetExpiresAt || user.resetExpiresAt < new Date() || !(await bcrypt.compare(data.code, user.resetCodeHash))) {
    throw new HttpError(400, "Invalid or expired reset code");
  }
  await prisma.user.update({ where: { id: user.id }, data: { password: await bcrypt.hash(data.password, 12), resetCodeHash: null, resetExpiresAt: null, sessionVersion: { increment: 1 } } });
  res.json({ message: "Password reset successful. You can log in now." });
}));

router.post("/logout", requireAuth, asyncHandler(async (req, res) => {
  await prisma.user.update({ where: { id: req.user!.id }, data: { sessionVersion: { increment: 1 } } });
  res.json({ message: "Logged out" });
}));

router.get("/me", requireAuth, asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user) throw new HttpError(404, "User not found");
  res.json(publicUser(user));
}));

export default router;
