import { User, UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";
import { Router } from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { env } from "../../config/env";
import { prisma } from "../../config/prisma";
import { requireAuth } from "../../middleware/auth.middleware";
import { asyncHandler } from "../../utils/async-handler";
import { HttpError } from "../../utils/http-error";

const router = Router();
const otpStore = new Map<string, { code: string; expiresAt: number }>();

function publicUser(user: User) {
  const { password: _password, ...safeUser } = user;
  return safeUser;
}

function createToken(user: User) {
  return jwt.sign({ role: user.role, sessionVersion: user.sessionVersion }, env.JWT_SECRET, {
    subject: user.id,
    expiresIn: "7d",
  });
}

router.post("/signup", asyncHandler(async (req, res) => {
  const data = z.object({
    name: z.string().trim().min(2).max(80),
    email: z.string().trim().email().transform((email) => email.toLowerCase()),
    phone: z.string().trim().min(10).max(15),
    password: z.string().min(8).max(72),
    accountType: z.enum(["CLIENT", "MERCHANT"]),
  }).parse(req.body);

  const existingUser = await prisma.user.findFirst({
    where: { OR: [{ email: data.email }, { phone: data.phone }] },
  });
  if (existingUser) throw new HttpError(409, "An account with this email or phone already exists");

  const user = await prisma.user.create({
    data: {
      name: data.name,
      email: data.email,
      phone: data.phone,
      password: await bcrypt.hash(data.password, 12),
      role: data.accountType === "MERCHANT" ? UserRole.OWNER : UserRole.CLIENT,
    },
  });
  res.status(201).json({ token: createToken(user), user: publicUser(user) });
}));

router.post("/login", asyncHandler(async (req, res) => {
  const data = z.object({
    email: z.string().trim().email().transform((email) => email.toLowerCase()),
    password: z.string().min(1),
  }).parse(req.body);
  const user = await prisma.user.findUnique({ where: { email: data.email } });
  if (!user?.password || !(await bcrypt.compare(data.password, user.password))) {
    throw new HttpError(401, "Invalid email or password");
  }
  res.json({ token: createToken(user), user: publicUser(user) });
}));

router.post("/logout", requireAuth, asyncHandler(async (req, res) => {
  await prisma.user.update({
    where: { id: req.user!.id },
    data: { sessionVersion: { increment: 1 } },
  });
  res.json({ message: "Logged out" });
}));

router.post("/request-otp", asyncHandler(async (req, res) => {
  const { phone } = z.object({ phone: z.string().min(10).max(15) }).parse(req.body);
  const code = env.OTP_BYPASS_CODE ?? String(Math.floor(100000 + Math.random() * 900000));
  otpStore.set(phone, { code, expiresAt: Date.now() + 5 * 60 * 1000 });
  res.json({ message: "OTP sent", ...(env.OTP_BYPASS_CODE && { devCode: code }) });
}));

router.post("/verify-otp", asyncHandler(async (req, res) => {
  const { phone, code, name, role } = z.object({
    phone: z.string().min(10).max(15),
    code: z.string().length(6),
    name: z.string().min(2).optional(),
    role: z.enum(["CLIENT", "OWNER"]).default("CLIENT"),
  }).parse(req.body);

  const otp = otpStore.get(phone);
  if (!otp || otp.expiresAt < Date.now() || otp.code !== code) {
    throw new HttpError(400, "Invalid or expired OTP");
  }
  otpStore.delete(phone);
  const user = await prisma.user.upsert({
    where: { phone },
    update: { ...(name && { name }) },
    create: { phone, name, role },
  });
  res.json({ token: createToken(user), user: publicUser(user) });
}));

router.get("/me", requireAuth, asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user) throw new HttpError(404, "User not found");
  res.json(publicUser(user));
}));

export default router;
