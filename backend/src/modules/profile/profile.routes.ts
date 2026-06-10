import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { Prisma } from "@prisma/client";
import express, { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma";
import { requireAuth } from "../../middleware/auth.middleware";
import { imageExtensionByType, normalizeUploadedImage, requireImageUpload } from "../../middleware/upload.middleware";
import { ensureReferralCode, generateUniqueReferralCode } from "../../services/referral.service";
import { ensureMembershipPlans, getMembershipPlans } from "../../services/membership.service";
import { sendSafetyIssueEmail } from "../../services/mail.service";
import { asyncHandler } from "../../utils/async-handler";
import { HttpError } from "../../utils/http-error";

const router = Router();
router.use(requireAuth);

const profileSelect: Prisma.UserSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  referralCode: true,
  role: true,
  profilePhotoUrl: true,
  emailVerified: true,
  addresses: { orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }] },
};

const addressSchema = z.object({
  label: z.string().trim().min(1, "Label is required").max(40),
  line1: z.string().trim().min(3, "Address line 1 is required").max(160),
  line2: z.string().trim().max(160).optional().or(z.literal("")),
  city: z.string().trim().min(1, "City is required").max(60),
  state: z.string().trim().min(1, "State is required").max(60),
  pincode: z.string().trim().min(3, "Pincode is required").max(12),
  isDefault: z.boolean().default(false),
});

router.get("/", asyncHandler(async (req, res) => {
  const profile = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: profileSelect,
  });
  if (!profile) throw new HttpError(404, "Profile not found");
  const referralCode = await ensureReferralCode(profile);
  res.json({ ...profile, referralCode });
}));

router.get("/membership", asyncHandler(async (req, res) => {
  const [plans, activeMembership] = await Promise.all([
    getMembershipPlans(),
    prisma.userMembership.findFirst({
      where: { userId: req.user!.id, isActive: true, expiresAt: { gt: new Date() } },
      include: { plan: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  res.json({ plans, activeMembership });
}));

router.post("/membership/subscribe", asyncHandler(async (req, res) => {
  const data = z.object({ planCode: z.string().trim().min(1) }).parse(req.body);
  const membership = await prisma.$transaction(async (tx) => {
    await ensureMembershipPlans(tx);
    const plan = await tx.membershipPlan.findUnique({ where: { code: data.planCode } });
    if (!plan?.isActive) throw new HttpError(404, "Membership plan not found");
    await tx.userMembership.updateMany({ where: { userId: req.user!.id, isActive: true }, data: { isActive: false } });
    return tx.userMembership.create({
      data: {
        userId: req.user!.id,
        planId: plan.id,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        remainingServices: plan.servicesPerMonth,
      },
      include: { plan: true },
    });
  });
  res.status(201).json(membership);
}));

router.post("/safety-issue", asyncHandler(async (req, res) => {
  const data = z.object({ message: z.string().trim().min(5).max(2000) }).parse(req.body);
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { name: true, email: true, phone: true, role: true },
  });
  if (!user) throw new HttpError(404, "Profile not found");
  sendSafetyIssueEmail({
    reporterName: user.name,
    reporterEmail: user.email,
    reporterPhone: user.phone,
    reporterRole: user.role,
    message: data.message,
  }).catch((error: unknown) => {
    console.error("Safety issue email failed", error);
  });
  res.status(202).json({ message: "Safety issue submitted." });
}));

router.patch("/", asyncHandler(async (req, res) => {
  const data = z.object({
    name: z.string().trim().min(2).max(80),
    phone: z.string().trim().regex(/^\+?[0-9]{10,15}$/, "Phone must be 10 to 15 digits"),
  }).parse(req.body);

  const duplicatePhone = await prisma.user.findFirst({
    where: { phone: data.phone, id: { not: req.user!.id } },
  });
  if (duplicatePhone) throw new HttpError(409, "This phone number is already used by another account");

  const referralCode = await generateUniqueReferralCode(data.name, data.phone, req.user!.id);
  res.json(await prisma.user.update({
    where: { id: req.user!.id },
    data: { ...data, referralCode },
    select: profileSelect,
  }));
}));

router.put("/photo", express.raw({ type: ["image/jpeg", "image/png", "image/webp"], limit: "3mb" }), requireImageUpload, asyncHandler(async (req, res) => {
  const mimeType = req.header("content-type") ?? "image/jpeg";
  const normalizedBuffer = await normalizeUploadedImage(req.body, mimeType);
  const base64Data = normalizedBuffer.toString("base64");
  const profilePhotoUrl = `data:${mimeType};base64,${base64Data}`;

  const user = await prisma.user.update({
    where: { id: req.user!.id },
    data: { profilePhotoUrl },
    select: profileSelect,
  });
  res.json(user);
}));

router.post("/addresses", asyncHandler(async (req, res) => {
  const data = addressSchema.parse(req.body);
  const address = await prisma.$transaction(async (tx) => {
    if (data.isDefault) {
      await tx.userAddress.updateMany({ where: { userId: req.user!.id }, data: { isDefault: false } });
    }
    return tx.userAddress.create({
      data: { ...data, line2: data.line2 || null, userId: req.user!.id },
    });
  });
  res.status(201).json(address);
}));

router.patch("/addresses/:id", asyncHandler(async (req, res) => {
  const data = addressSchema.partial().parse(req.body);
  const existing = await prisma.userAddress.findFirst({ where: { id: String(req.params.id), userId: req.user!.id } });
  if (!existing) throw new HttpError(404, "Address not found");

  const address = await prisma.$transaction(async (tx) => {
    if (data.isDefault) {
      await tx.userAddress.updateMany({ where: { userId: req.user!.id }, data: { isDefault: false } });
    }
    return tx.userAddress.update({
      where: { id: existing.id },
      data: { ...data, line2: data.line2 === "" ? null : data.line2 },
    });
  });
  res.json(address);
}));

router.delete("/addresses/:id", asyncHandler(async (req, res) => {
  const existing = await prisma.userAddress.findFirst({ where: { id: String(req.params.id), userId: req.user!.id } });
  if (!existing) throw new HttpError(404, "Address not found");
  await prisma.userAddress.delete({ where: { id: existing.id } });
  res.status(204).send();
}));

export default router;
