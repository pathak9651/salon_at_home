import { BookingStatus, UserRole } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma";
import { requireAuth } from "../../middleware/auth.middleware";
import { asyncHandler } from "../../utils/async-handler";
import { HttpError } from "../../utils/http-error";

const router = Router();
router.use(requireAuth);

router.get("/", asyncHandler(async (req, res) => {
  const where = req.user!.role === UserRole.OWNER
    ? { salon: { ownerId: req.user!.id } }
    : { clientId: req.user!.id };
  res.json(await prisma.booking.findMany({
    where,
    include: { salon: true, service: true, payment: true },
    orderBy: { scheduledAt: "desc" },
  }));
}));

router.post("/", asyncHandler(async (req, res) => {
  const data = z.object({
    salonId: z.string(),
    serviceId: z.string(),
    scheduledAt: z.coerce.date().refine((date) => date > new Date(), "Choose a future time"),
    address: z.string().min(5),
  }).parse(req.body);
  const service = await prisma.service.findFirst({ where: { id: data.serviceId, salonId: data.salonId } });
  if (!service) throw new HttpError(404, "Service not found");
  res.status(201).json(await prisma.booking.create({
    data: { ...data, clientId: req.user!.id, totalAmount: service.price },
  }));
}));

router.patch("/:id/status", asyncHandler(async (req, res) => {
  const { status } = z.object({ status: z.nativeEnum(BookingStatus) }).parse(req.body);
  const booking = await prisma.booking.findUnique({
    where: { id: String(req.params.id) },
    include: { salon: true },
  });
  if (!booking) throw new HttpError(404, "Booking not found");
  const isOwner = booking.salon.ownerId === req.user!.id;
  const isClientCancelling = booking.clientId === req.user!.id && status === BookingStatus.CANCELLED;
  if (!isOwner && !isClientCancelling) throw new HttpError(403, "Status change not allowed");
  res.json(await prisma.booking.update({ where: { id: booking.id }, data: { status } }));
}));

export default router;
