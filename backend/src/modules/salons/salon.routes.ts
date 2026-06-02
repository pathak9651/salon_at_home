import { UserRole } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma";
import { requireAuth, requireRole } from "../../middleware/auth.middleware";
import { asyncHandler } from "../../utils/async-handler";
import { HttpError } from "../../utils/http-error";

const router = Router();

function distanceKm(fromLat: number, fromLng: number, toLat: number, toLng: number) {
  const earthRadiusKm = 6371;
  const latDelta = ((toLat - fromLat) * Math.PI) / 180;
  const lngDelta = ((toLng - fromLng) * Math.PI) / 180;
  const fromLatRad = (fromLat * Math.PI) / 180;
  const toLatRad = (toLat * Math.PI) / 180;
  const a = Math.sin(latDelta / 2) ** 2 + Math.cos(fromLatRad) * Math.cos(toLatRad) * Math.sin(lngDelta / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

router.get("/", asyncHandler(async (req, res) => {
  const query = z.object({
    lat: z.coerce.number().min(-90).max(90).optional(),
    lng: z.coerce.number().min(-180).max(180).optional(),
    radiusKm: z.coerce.number().positive().max(100).default(25),
  }).parse(req.query);

  const salons = await prisma.salon.findMany({
    include: { services: true, reviews: { select: { rating: true } } },
    orderBy: { createdAt: "desc" },
  });

  const withLocationMeta = salons.map((salon) => {
    const rating = salon.reviews.length
      ? salon.reviews.reduce((sum, review) => sum + review.rating, 0) / salon.reviews.length
      : null;
    const distance = query.lat !== undefined && query.lng !== undefined
      ? distanceKm(query.lat, query.lng, salon.latitude, salon.longitude)
      : null;

    return {
      ...salon,
      rating,
      reviewCount: salon.reviews.length,
      distanceKm: distance === null ? null : Number(distance.toFixed(2)),
    };
  });

  const nearbySalons = query.lat !== undefined && query.lng !== undefined
    ? withLocationMeta
        .filter((salon) => salon.distanceKm !== null && salon.distanceKm <= query.radiusKm)
        .sort((a, b) => (a.distanceKm ?? Number.MAX_VALUE) - (b.distanceKm ?? Number.MAX_VALUE))
    : withLocationMeta;

  res.json(nearbySalons);
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
