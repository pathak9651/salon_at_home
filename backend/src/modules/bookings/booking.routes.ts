import { BookingStatus, UserRole } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma";
import { requireAuth, requireRole } from "../../middleware/auth.middleware";
import { asyncHandler } from "../../utils/async-handler";
import { HttpError } from "../../utils/http-error";

const router = Router();
router.use(requireAuth);

const cancellableByClientStatuses: BookingStatus[] = [BookingStatus.PENDING, BookingStatus.ACCEPTED];

router.get("/", asyncHandler(async (req, res) => {
  const where = req.user!.role === UserRole.OWNER
    ? { salon: { ownerId: req.user!.id } }
    : { clientId: req.user!.id };
  res.json(await prisma.booking.findMany({
    where,
    include: { salon: true, service: true, services: { include: { service: true } }, payment: true },
    orderBy: { scheduledAt: "desc" },
  }));
}));

router.post("/", requireRole(UserRole.CLIENT), asyncHandler(async (req, res) => {
  const data = z.object({
    salonId: z.string(),
    serviceId: z.string().optional(),
    serviceIds: z.array(z.string()).min(1).max(8).optional(),
    scheduledAt: z.coerce.date().refine((date) => date > new Date(), "Choose a future time"),
    address: z.string().min(5),
    instructions: z.string().trim().max(500).optional(),
  }).parse(req.body);

  const serviceIds = [...new Set(data.serviceIds ?? (data.serviceId ? [data.serviceId] : []))];
  if (!serviceIds.length) throw new HttpError(400, "Choose at least one service");
  const services = await prisma.service.findMany({ where: { id: { in: serviceIds }, salonId: data.salonId } });
  if (services.length !== serviceIds.length) throw new HttpError(404, "One or more services were not found");
  const sortedServices = serviceIds.map((id) => services.find((service) => service.id === id)!);
  const totalAmount = sortedServices.reduce((sum, service) => sum + service.price, 0);

  res.status(201).json(await prisma.booking.create({
    data: {
      salonId: data.salonId,
      serviceId: sortedServices[0].id,
      scheduledAt: data.scheduledAt,
      address: data.address,
      instructions: data.instructions,
      clientId: req.user!.id,
      totalAmount,
      services: {
        create: sortedServices.map((service) => ({ serviceId: service.id, price: service.price })),
      },
    },
    include: { salon: true, service: true, services: { include: { service: true } }, payment: true },
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
  const allowedOwnerTransitions: Record<BookingStatus, BookingStatus[]> = {
    PENDING: [BookingStatus.ACCEPTED, BookingStatus.REJECTED],
    ACCEPTED: [BookingStatus.COMPLETED, BookingStatus.CANCELLED],
    REJECTED: [],
    COMPLETED: [],
    CANCELLED: [],
  };
  if (isOwner && !allowedOwnerTransitions[booking.status].includes(status)) {
    throw new HttpError(400, `Cannot change booking from ${booking.status} to ${status}`);
  }
  if (isClientCancelling && !cancellableByClientStatuses.includes(booking.status)) {
    throw new HttpError(400, `Cannot cancel a ${booking.status.toLowerCase()} booking`);
  }
  res.json(await prisma.booking.update({ where: { id: booking.id }, data: { status } }));
}));

export default router;
