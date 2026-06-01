import { UserRole } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma";
import { requireAuth, requireRole } from "../../middleware/auth.middleware";
import { asyncHandler } from "../../utils/async-handler";
import { HttpError } from "../../utils/http-error";

const router = Router();

router.get("/", asyncHandler(async (_req, res) => {
  const salons = await prisma.salon.findMany({
    include: { services: true, reviews: { select: { rating: true } } },
    orderBy: { createdAt: "desc" },
  });
  res.json(salons);
}));

router.get("/:id", asyncHandler(async (req, res) => {
  const salon = await prisma.salon.findUnique({
    where: { id: String(req.params.id) },
    include: { services: true, reviews: true },
  });
  if (!salon) throw new HttpError(404, "Salon not found");
  res.json(salon);
}));

router.post("/", requireAuth, requireRole(UserRole.OWNER), asyncHandler(async (req, res) => {
  const data = z.object({
    name: z.string().min(2),
    description: z.string().optional(),
    address: z.string().min(5),
    latitude: z.number(),
    longitude: z.number(),
    imageUrl: z.string().url().optional(),
  }).parse(req.body);
  res.status(201).json(await prisma.salon.create({ data: { ...data, ownerId: req.user!.id } }));
}));

router.post("/:id/services", requireAuth, requireRole(UserRole.OWNER), asyncHandler(async (req, res) => {
  const salon = await prisma.salon.findFirst({ where: { id: String(req.params.id), ownerId: req.user!.id } });
  if (!salon) throw new HttpError(404, "Salon not found");
  const data = z.object({
    name: z.string().min(2),
    description: z.string().optional(),
    price: z.number().int().positive(),
    durationMin: z.number().int().min(15),
  }).parse(req.body);
  res.status(201).json(await prisma.service.create({ data: { ...data, salonId: salon.id } }));
}));

export default router;
