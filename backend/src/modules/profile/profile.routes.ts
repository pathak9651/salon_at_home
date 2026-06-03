import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { Prisma } from "@prisma/client";
import express, { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma";
import { requireAuth } from "../../middleware/auth.middleware";
import { imageExtensionByType, normalizeUploadedImage, requireImageUpload } from "../../middleware/upload.middleware";
import { asyncHandler } from "../../utils/async-handler";
import { HttpError } from "../../utils/http-error";

const router = Router();
router.use(requireAuth);

const profileSelect: Prisma.UserSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
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
  res.json(profile);
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

  res.json(await prisma.user.update({
    where: { id: req.user!.id },
    data,
    select: profileSelect,
  }));
}));

router.put("/photo", express.raw({ type: ["image/jpeg", "image/png", "image/webp"], limit: "3mb" }), requireImageUpload, asyncHandler(async (req, res) => {
  const extension = imageExtensionByType[req.header("content-type") as keyof typeof imageExtensionByType];

  const uploadDir = path.join(process.cwd(), "uploads", "profiles");
  await mkdir(uploadDir, { recursive: true });
  const filename = `${req.user!.id}-${randomUUID()}.${extension}`;
  await writeFile(path.join(uploadDir, filename), await normalizeUploadedImage(req.body, req.header("content-type") ?? ""));

  const profilePhotoUrl = `/uploads/profiles/${filename}`;
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
