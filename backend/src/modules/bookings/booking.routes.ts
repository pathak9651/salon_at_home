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
const bookingInclude = {
  salon: true,
  service: true,
  services: { include: { service: true } },
  payment: true,
  client: { select: { id: true, name: true, phone: true, email: true } },
};

function shapeBookingForUser<T extends { client?: unknown; status: BookingStatus }>(booking: T, role: UserRole) {
  if (role !== UserRole.OWNER || booking.status !== BookingStatus.PENDING) return booking;
  return { ...booking, client: null };
}

router.get("/", asyncHandler(async (req, res) => {
  const where = req.user!.role === UserRole.OWNER
    ? { salon: { ownerId: req.user!.id } }
    : { clientId: req.user!.id };
  res.json(await prisma.booking.findMany({
    where,
    include: bookingInclude,
    orderBy: { scheduledAt: "desc" },
  }).then((bookings) => bookings.map((booking) => shapeBookingForUser(booking, req.user!.role))));
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
    include: bookingInclude,
  }));
}));

router.patch("/:id/reschedule", asyncHandler(async (req, res) => {
  const { scheduledAt } = z.object({
    scheduledAt: z.coerce.date().refine((date) => date > new Date(), "Choose a future time"),
  }).parse(req.body);

  const booking = await prisma.booking.findFirst({
    where: req.user!.role === UserRole.OWNER
      ? { id: String(req.params.id), salon: { ownerId: req.user!.id } }
      : { id: String(req.params.id), clientId: req.user!.id },
    include: { salon: true },
  });
  if (!booking) throw new HttpError(404, "Booking not found");
  if (req.user!.role === UserRole.CLIENT && !cancellableByClientStatuses.includes(booking.status)) {
    throw new HttpError(400, `Cannot reschedule a ${booking.status.toLowerCase()} booking`);
  }
  const ownerReschedulableStatuses: BookingStatus[] = [BookingStatus.PENDING, BookingStatus.ACCEPTED];
  if (req.user!.role === UserRole.OWNER && !ownerReschedulableStatuses.includes(booking.status)) {
    throw new HttpError(400, `Cannot reschedule a ${booking.status.toLowerCase()} booking`);
  }

  const updated = await prisma.booking.update({
    where: { id: booking.id },
    data: { scheduledAt },
    include: bookingInclude,
  });
  res.json(shapeBookingForUser(updated, req.user!.role));
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
  const updated = await prisma.booking.update({ where: { id: booking.id }, data: { status }, include: bookingInclude });
  res.json(shapeBookingForUser(updated, req.user!.role));
}));

export default router;
