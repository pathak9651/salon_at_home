import { BookingStatus, UserRole } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma";
import { requireAuth, requireRole } from "../../middleware/auth.middleware";
import { createNotifications } from "../notifications/notification.service";
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
  review: true,
  employee: true,
  client: { select: { id: true, name: true, phone: true, email: true } },
};

function shapeBookingForUser<T extends { client?: unknown; status: BookingStatus }>(booking: T, role: UserRole) {
  if (role !== UserRole.OWNER || booking.status !== BookingStatus.PENDING) return booking;
  return { ...booking, client: null };
}

function serviceNames(booking: { service?: { name: string }; services?: Array<{ service: { name: string } }> }) {
  return booking.services?.length ? booking.services.map((item) => item.service.name).join(", ") : booking.service?.name ?? "Salon service";
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

  const booking = await prisma.$transaction(async (tx) => {
    const created = await tx.booking.create({
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
    });
    await createNotifications([
      {
        userId: req.user!.id,
        type: "BOOKING_CREATED",
        title: "Booking request sent",
        message: `${serviceNames(created)} at ${created.salon.name} is waiting for merchant response.`,
        bookingId: created.id,
      },
      {
        userId: created.salon.ownerId,
        type: "BOOKING_CREATED",
        title: "New booking request",
        message: `${serviceNames(created)} requested for INR ${created.totalAmount}.`,
        bookingId: created.id,
      },
    ], tx);
    return created;
  });
  res.status(201).json(booking);
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

  const updated = await prisma.$transaction(async (tx) => {
    const nextBooking = await tx.booking.update({
      where: { id: booking.id },
      data: { scheduledAt },
      include: bookingInclude,
    });
    await createNotifications([
      {
        userId: nextBooking.clientId,
        type: "BOOKING_RESCHEDULED",
        title: "Booking rescheduled",
        message: `${nextBooking.salon.name} booking moved to ${nextBooking.scheduledAt.toLocaleString()}.`,
        bookingId: nextBooking.id,
      },
      {
        userId: nextBooking.salon.ownerId,
        type: "BOOKING_RESCHEDULED",
        title: "Booking rescheduled",
        message: `${serviceNames(nextBooking)} moved to ${nextBooking.scheduledAt.toLocaleString()}.`,
        bookingId: nextBooking.id,
      },
    ], tx);
    return nextBooking;
  });
  res.json(shapeBookingForUser(updated, req.user!.role));
}));

router.patch("/:id/employee", requireRole(UserRole.OWNER), asyncHandler(async (req, res) => {
  const data = z.object({ employeeId: z.string().nullable().optional() }).parse(req.body);
  const booking = await prisma.booking.findFirst({
    where: { id: String(req.params.id), salon: { ownerId: req.user!.id } },
    include: { salon: true },
  });
  if (!booking) throw new HttpError(404, "Booking not found");

  if (data.employeeId) {
    const employee = await prisma.employee.findFirst({
      where: { id: data.employeeId, salonId: booking.salonId, salon: { ownerId: req.user!.id }, isActive: true },
    });
    if (!employee) throw new HttpError(404, "Active employee not found for this salon");
  }

  const updated = await prisma.booking.update({
    where: { id: booking.id },
    data: { employeeId: data.employeeId ?? null },
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
  const updated = await prisma.$transaction(async (tx) => {
    const nextBooking = await tx.booking.update({ where: { id: booking.id }, data: { status }, include: bookingInclude });
    if (status === BookingStatus.ACCEPTED) {
      await createNotifications([
        {
          userId: nextBooking.clientId,
          type: "BOOKING_ACCEPTED",
          title: "Booking accepted",
          message: `${nextBooking.salon.name} accepted your booking for ${nextBooking.scheduledAt.toLocaleString()}.`,
          bookingId: nextBooking.id,
        },
      ], tx);
    }
    if (status === BookingStatus.REJECTED) {
      await createNotifications([
        {
          userId: nextBooking.clientId,
          type: "BOOKING_REJECTED",
          title: "Booking rejected",
          message: `${nextBooking.salon.name} rejected your booking request.`,
          bookingId: nextBooking.id,
        },
      ], tx);
    }
    if (status === BookingStatus.COMPLETED) {
      await createNotifications([
        {
          userId: nextBooking.clientId,
          type: "SERVICE_COMPLETED",
          title: "Service completed",
          message: `${nextBooking.salon.name} marked your service complete. You can pay online now.`,
          bookingId: nextBooking.id,
        },
      ], tx);
    }
    return nextBooking;
  });
  res.json(shapeBookingForUser(updated, req.user!.role));
}));

export default router;
