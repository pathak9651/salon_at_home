import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { Prisma, UserRole } from "@prisma/client";
import express, { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma";
import { requireAuth, requireRole } from "../../middleware/auth.middleware";
import { imageExtensionByType, normalizeUploadedImage, requireImageUpload } from "../../middleware/upload.middleware";
import { asyncHandler } from "../../utils/async-handler";
import { HttpError } from "../../utils/http-error";

const router = Router();

const imageUrlSchema = z.string().trim().min(1).refine((value) => {
  return value.startsWith("/uploads/");
}, "Image must be uploaded through the app");

const pageQueryFields = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
};

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
    search: z.string().trim().optional(),
    minRating: z.coerce.number().min(0).max(5).optional(),
    maxPrice: z.coerce.number().int().positive().optional(),
    service: z.string().trim().optional(),
    ...pageQueryFields,
  }).parse(req.query);

  const where: Prisma.SalonWhereInput = {
      status: "APPROVED",
      owner: { deletedAt: null },
      ...(query.search && {
        OR: [
          { name: { contains: query.search, mode: "insensitive" } },
          { address: { contains: query.search, mode: "insensitive" } },
          { description: { contains: query.search, mode: "insensitive" } },
          { services: { some: { name: { contains: query.search, mode: "insensitive" } } } },
        ],
      }),
      ...(query.service && { services: { some: { name: { contains: query.service, mode: "insensitive" } } } }),
      ...(query.maxPrice && { services: { some: { price: { lte: query.maxPrice } } } }),
    };
  const [total, salons] = await Promise.all([
    prisma.salon.count({ where }),
    prisma.salon.findMany({
    where,
    include: { services: true, images: true, reviews: { select: { rating: true } } },
    orderBy: { createdAt: "desc" },
    skip: (query.page - 1) * query.limit,
    take: query.limit,
  }),
  ]);
  res.setHeader("X-Total-Count", total);

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
      minServicePrice: salon.services.length ? Math.min(...salon.services.map((service) => service.price)) : null,
      coverImageUrl: salon.imageUrl ?? salon.images[0]?.url ?? null,
      distanceKm: distance === null ? null : Number(distance.toFixed(2)),
    };
  });

  const nearbySalons = query.lat !== undefined && query.lng !== undefined
    ? withLocationMeta
        .filter((salon) => salon.distanceKm !== null && salon.distanceKm <= query.radiusKm)
        .sort((a, b) => (a.distanceKm ?? Number.MAX_VALUE) - (b.distanceKm ?? Number.MAX_VALUE))
    : withLocationMeta;

  res.json(nearbySalons.filter((salon) => query.minRating === undefined || (salon.rating ?? 0) >= query.minRating));
}));

router.get("/mine", requireAuth, requireRole(UserRole.OWNER), asyncHandler(async (req, res) => {
  res.json(await prisma.salon.findMany({
    where: { ownerId: req.user!.id },
    include: {
      images: true,
      services: true,
      owner: { select: { name: true, phone: true, email: true, emailVerified: true } },
    },
    orderBy: { createdAt: "desc" },
  }));
}));

router.get("/:id", asyncHandler(async (req, res) => {
  const salon = await prisma.salon.findUnique({
    where: { id: String(req.params.id) },
    include: { services: true, images: true, reviews: { include: { client: { select: { id: true, name: true } } }, orderBy: { createdAt: "desc" } } },
  });
  if (!salon) throw new HttpError(404, "Salon not found");
  if (salon.status !== "APPROVED") throw new HttpError(404, "Salon not found");
  const rating = salon.reviews.length
    ? salon.reviews.reduce((sum, review) => sum + review.rating, 0) / salon.reviews.length
    : null;
  res.json({
    ...salon,
    rating,
    reviewCount: salon.reviews.length,
    minServicePrice: salon.services.length ? Math.min(...salon.services.map((service) => service.price)) : null,
    coverImageUrl: salon.imageUrl ?? salon.images[0]?.url ?? null,
  });
}));

router.post("/", requireAuth, requireRole(UserRole.OWNER), asyncHandler(async (req, res) => {
  const data = z.object({
    name: z.string().trim().min(2),
    description: z.string().trim().optional().or(z.literal("")),
    address: z.string().trim().min(5),
    latitude: z.coerce.number().min(-90).max(90),
    longitude: z.coerce.number().min(-180).max(180),
    imageUrl: imageUrlSchema.optional(),
    images: z.array(z.object({ url: imageUrlSchema, caption: z.string().trim().optional() })).default([]),
  }).parse(req.body);
  const { images, ...salonData } = data;
  res.status(201).json(await prisma.salon.create({
    data: { ...salonData, description: salonData.description || null, ownerId: req.user!.id, images: { create: images } },
    include: { images: true, services: true, owner: { select: { name: true, phone: true, email: true, emailVerified: true } } },
  }));
}));

router.post("/:id/images", requireAuth, requireRole(UserRole.OWNER), asyncHandler(async (req, res) => {
  const salon = await prisma.salon.findFirst({ where: { id: String(req.params.id), ownerId: req.user!.id } });
  if (!salon) throw new HttpError(404, "Salon not found");
  const data = z.object({ url: imageUrlSchema, caption: z.string().trim().optional() }).parse(req.body);
  res.status(201).json(await prisma.salonImage.create({ data: { ...data, salonId: salon.id } }));
}));

router.post("/:id/images/upload", requireAuth, requireRole(UserRole.OWNER), express.raw({ type: ["image/jpeg", "image/png", "image/webp"], limit: "5mb" }), requireImageUpload, asyncHandler(async (req, res) => {
  const salon = await prisma.salon.findFirst({ where: { id: String(req.params.id), ownerId: req.user!.id } });
  if (!salon) throw new HttpError(404, "Salon not found");

  const mimeType = req.header("content-type") ?? "image/jpeg";
  const normalizedBuffer = await normalizeUploadedImage(req.body, mimeType);
  const base64Data = normalizedBuffer.toString("base64");
  const dataUrl = `data:${mimeType};base64,${base64Data}`;

  const image = await prisma.salonImage.create({
    data: { salonId: salon.id, url: dataUrl, caption: "Salon photo" },
  });
  if (!salon.imageUrl) {
    await prisma.salon.update({ where: { id: salon.id }, data: { imageUrl: image.url } });
  }
  res.status(201).json(image);
}));

router.post("/:id/services", requireAuth, requireRole(UserRole.OWNER), asyncHandler(async (req, res) => {
  const salon = await prisma.salon.findFirst({ where: { id: String(req.params.id), ownerId: req.user!.id } });
  if (!salon) throw new HttpError(404, "Salon not found");
  const data = z.object({
    name: z.string().trim().min(2),
    description: z.string().trim().optional().or(z.literal("")),
    price: z.coerce.number().int().positive(),
    durationMin: z.coerce.number().int().min(15),
  }).parse(req.body);
  res.status(201).json(await prisma.service.create({ data: { ...data, description: data.description || null, salonId: salon.id } }));
}));

router.patch("/:id/services/:serviceId", requireAuth, requireRole(UserRole.OWNER), asyncHandler(async (req, res) => {
  const salon = await prisma.salon.findFirst({ where: { id: String(req.params.id), ownerId: req.user!.id } });
  if (!salon) throw new HttpError(404, "Salon not found");
  const service = await prisma.service.findFirst({ where: { id: String(req.params.serviceId), salonId: salon.id } });
  if (!service) throw new HttpError(404, "Service not found");
  const data = z.object({
    name: z.string().trim().min(2).optional(),
    description: z.string().trim().optional().or(z.literal("")),
    price: z.coerce.number().int().positive().optional(),
    durationMin: z.coerce.number().int().min(15).optional(),
  }).parse(req.body);
  res.json(await prisma.service.update({
    where: { id: service.id },
    data: { ...data, description: data.description === "" ? null : data.description },
  }));
}));

router.delete("/:id/services/:serviceId", requireAuth, requireRole(UserRole.OWNER), asyncHandler(async (req, res) => {
  const salon = await prisma.salon.findFirst({ where: { id: String(req.params.id), ownerId: req.user!.id } });
  if (!salon) throw new HttpError(404, "Salon not found");
  const service = await prisma.service.findFirst({ where: { id: String(req.params.serviceId), salonId: salon.id } });
  if (!service) throw new HttpError(404, "Service not found");
  const bookingCount = await prisma.booking.count({ where: { OR: [{ serviceId: service.id }, { services: { some: { serviceId: service.id } } }] } });
  if (bookingCount > 0) throw new HttpError(409, "This service has bookings and cannot be deleted");
  await prisma.service.delete({ where: { id: service.id } });
  res.status(204).send();
}));

export default router;
