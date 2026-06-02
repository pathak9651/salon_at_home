import { BookingStatus } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma";
import { requireAuth } from "../../middleware/auth.middleware";
import { asyncHandler } from "../../utils/async-handler";
import { HttpError } from "../../utils/http-error";

const router = Router();

router.get("/salon/:salonId", asyncHandler(async (req, res) => {
  res.json(await prisma.review.findMany({
    where: { salonId: String(req.params.salonId) },
    include: { client: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  }));
}));

router.post("/", requireAuth, asyncHandler(async (req, res) => {
  const data = z.object({
    bookingId: z.string(),
    rating: z.number().int().min(1).max(5),
    comment: z.string().max(500).optional(),
  }).parse(req.body);
  const booking = await prisma.booking.findFirst({
    where: { id: data.bookingId, clientId: req.user!.id, status: BookingStatus.COMPLETED },
    include: { review: true },
  });
  if (!booking) throw new HttpError(400, "Only completed bookings can be reviewed");
  if (booking.review) throw new HttpError(409, "You have already reviewed this booking");
  res.status(201).json(await prisma.review.create({
    data: { ...data, clientId: req.user!.id, salonId: booking.salonId },
    include: { client: { select: { id: true, name: true } } },
  }));
}));

export default router;
