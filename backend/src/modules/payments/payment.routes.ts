import crypto from "node:crypto";
import { BookingStatus, UserRole } from "@prisma/client";
import { Request, Response, Router } from "express";
import Razorpay from "razorpay";
import { z } from "zod";
import { env } from "../../config/env";
import { prisma } from "../../config/prisma";
import { requireAuth } from "../../middleware/auth.middleware";
import { auditLog } from "../../services/audit.service";
import { sendPaymentInvoiceEmail } from "../../services/mail.service";
import { createNotifications } from "../notifications/notification.service";
import { asyncHandler } from "../../utils/async-handler";
import { HttpError } from "../../utils/http-error";

const router = Router();
router.use(requireAuth);

type AuthedUser = { id: string; role: UserRole };

const paymentInclude = {
  booking: {
    include: {
      salon: { include: { owner: { select: { id: true, name: true, phone: true, email: true } } } },
      service: true,
      services: { include: { service: true } },
      client: { select: { id: true, name: true, phone: true, email: true } },
    },
  },
};
export async function getPlatformCommissionRate(): Promise<number> {
  try {
    const setting = await prisma.systemSetting.findUnique({ where: { key: "platform_commission_percent" } });
    if (setting) return parseInt(setting.value, 10);

    // Auto-seed to 0% (free of cost) if not present
    const created = await prisma.systemSetting.create({
      data: { key: "platform_commission_percent", value: "0" }
    }).catch(() => null);

    return created ? 0 : 0;
  } catch {
    return 0;
  }
}

function splitAmount(amount: number, commissionRate: number) {
  const platformFee = Math.round((amount * commissionRate) / 100);
  return {
    platformFee,
    merchantAmount: amount - platformFee,
    commissionRate,
  };
}

function invoiceNumber() {
  return `INV-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

function expectedPaise(amount: number) {
  return amount * 100;
}

function paymentAccessWhere(user: AuthedUser) {
  if (user.role === UserRole.ADMIN) return {};
  if (user.role === UserRole.OWNER) return { booking: { salon: { ownerId: user.id } } };
  return { booking: { clientId: user.id } };
}

async function adminIds() {
  const admins = await prisma.user.findMany({ where: { role: UserRole.ADMIN }, select: { id: true } });
  return admins.map((admin) => admin.id);
}

async function sendOnlinePaymentNotifications(payment: Awaited<ReturnType<typeof markPaymentPaidOnline>>) {
  if (payment.booking.client.email) {
    const serviceNames = payment.booking.services.length
      ? payment.booking.services.map((item) => item.service.name)
      : [payment.booking.service.name];
    sendPaymentInvoiceEmail({
      to: payment.booking.client.email,
      clientName: payment.booking.client.name,
      invoiceNumber: payment.invoiceNumber,
      paidAt: payment.paidAt,
      amount: payment.amount,
      currency: payment.currency,
      method: payment.method,
      razorpayPayment: payment.razorpayPayment,
      bookingId: payment.bookingId,
      salonName: payment.booking.salon.name,
      serviceNames,
      scheduledFor: payment.booking.scheduledAt,
      serviceAddress: payment.booking.address,
    }).catch((error: unknown) => {
      console.error("Payment invoice email failed", error);
    });
  }
}

async function markPaymentPaidOnline(bookingId: string, razorpayPaymentId: string) {
  const existing = await prisma.payment.findUnique({
    where: { bookingId },
    include: paymentInclude,
  });
  if (!existing) throw new HttpError(404, "Payment order not found");
  if (existing.status === "PAID") return existing;
  if (existing.booking.status !== BookingStatus.PAYMENT_PENDING) {
    throw new HttpError(400, "Payment can close only bookings waiting for online payment");
  }

  const admins = await adminIds();
  const commissionRate = await getPlatformCommissionRate();
  return prisma.$transaction(async (tx) => {
    await tx.booking.update({
      where: { id: bookingId },
      data: { status: BookingStatus.COMPLETED },
    });
    const updated = await tx.payment.update({
      where: { bookingId },
      data: { status: "PAID", method: "ONLINE", razorpayPayment: razorpayPaymentId, invoiceNumber: invoiceNumber(), paidAt: new Date(), ...splitAmount(existing.amount, commissionRate) },
      include: paymentInclude,
    });
    await createNotifications([
      {
        userId: updated.booking.clientId,
        type: "PAYMENT_RECEIVED",
        title: "Payment successful",
        message: `Online payment of INR ${updated.amount} received for ${updated.booking.salon.name}.`,
        bookingId: updated.bookingId,
        paymentId: updated.id,
      },
      {
        userId: updated.booking.salon.ownerId,
        type: "PAYMENT_RECEIVED",
        title: "Online payment received",
        message: `INR ${updated.merchantAmount} merchant amount recorded after platform brokerage.`,
        bookingId: updated.bookingId,
        paymentId: updated.id,
      },
      ...admins.map((userId) => ({
        userId,
        type: "PAYMENT_RECEIVED" as const,
        title: "Online payment closed",
        message: `Booking ${updated.bookingId.slice(0, 8).toUpperCase()} closed online for INR ${updated.amount}.`,
        bookingId: updated.bookingId,
        paymentId: updated.id,
      })),
    ], tx);
    return updated;
  }, {
    timeout: 15000
  });
}

export async function razorpayWebhookHandler(req: Request, res: Response) {
  if (!env.RAZORPAY_WEBHOOK_SECRET) return res.status(503).json({ error: "Webhook secret not configured" });
  const signature = req.header("x-razorpay-signature") ?? "";
  const body = Buffer.isBuffer(req.body) ? req.body : Buffer.from("");
  const expected = crypto.createHmac("sha256", env.RAZORPAY_WEBHOOK_SECRET).update(body).digest("hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  const receivedBuffer = Buffer.from(signature, "hex");
  if (expectedBuffer.length !== receivedBuffer.length || !crypto.timingSafeEqual(expectedBuffer, receivedBuffer)) {
    return res.status(400).json({ error: "Invalid webhook signature" });
  }

  const event = JSON.parse(body.toString("utf8")) as {
    event?: string;
    payload?: { payment?: { entity?: { id?: string; order_id?: string; amount?: number; currency?: string; status?: string } } };
  };
  const entity = event.payload?.payment?.entity;
  if (event.event === "payment.captured" && entity?.order_id && entity.id) {
    const payment = await prisma.payment.findUnique({
      where: { razorpayOrder: entity.order_id },
      include: { booking: true },
    });
    if (
      payment?.booking.status === BookingStatus.PAYMENT_PENDING
      && entity.status === "captured"
      && entity.currency === payment.currency
      && entity.amount === expectedPaise(payment.amount)
    ) {
      const paidPayment = await markPaymentPaidOnline(payment.bookingId, entity.id);
      await sendOnlinePaymentNotifications(paidPayment);
      await auditLog({ action: "RAZORPAY_WEBHOOK_PAYMENT_CAPTURED", entity: "Payment", entityId: paidPayment.id, metadata: { razorpayPaymentId: entity.id } });
    }
  }
  res.json({ received: true });
}

router.get("/", asyncHandler(async (req, res) => {
  res.json(await prisma.payment.findMany({
    where: paymentAccessWhere(req.user!),
    include: paymentInclude,
    orderBy: { updatedAt: "desc" },
  }));
}));

router.get("/rate", asyncHandler(async (_req, res) => {
  const rate = await getPlatformCommissionRate();
  res.json({ commissionRate: rate });
}));

router.get("/:id/invoice", asyncHandler(async (req, res) => {
  const payment = await prisma.payment.findFirst({
    where: { id: String(req.params.id), status: "PAID", ...paymentAccessWhere(req.user!) },
    include: paymentInclude,
  });
  if (!payment) throw new HttpError(404, "Paid invoice not found");
  res.json({
    invoiceNumber: payment.invoiceNumber,
    paidAt: payment.paidAt,
    currency: payment.currency,
    amount: payment.amount,
    platformFee: payment.platformFee,
    merchantAmount: payment.merchantAmount,
    commissionRate: payment.commissionRate,
    method: payment.method,
    cashRemark: payment.cashRemark,
    collectedById: payment.collectedById,
    settlementStatus: payment.settlementStatus,
    razorpayPayment: payment.razorpayPayment,
    booking: payment.booking,
  });
}));

router.post("/order", asyncHandler(async (req, res) => {
  const { bookingId } = z.object({ bookingId: z.string() }).parse(req.body);
  const booking = await prisma.booking.findFirst({ where: { id: bookingId, clientId: req.user!.id }, include: { payment: true } });
  if (!booking) throw new HttpError(404, "Booking not found");
  if (booking.status !== BookingStatus.PAYMENT_PENDING) throw new HttpError(400, "Payment is available only after the merchant requests online payment");
  if (booking.payment?.status === "PAID") throw new HttpError(400, "This booking is already closed for payment");
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) throw new HttpError(503, "Payment provider not configured");
  const razorpay = new Razorpay({ key_id: env.RAZORPAY_KEY_ID, key_secret: env.RAZORPAY_KEY_SECRET });
  const commissionRate = await getPlatformCommissionRate();
  const split = splitAmount(booking.totalAmount, commissionRate);
  const order = await razorpay.orders.create({
    amount: booking.totalAmount * 100,
    currency: "INR",
    receipt: `booking_${booking.id.slice(0, 24)}`,
    notes: { bookingId: booking.id, commissionPercent: String(commissionRate) },
  });
  const payment = await prisma.payment.upsert({
    where: { bookingId },
    update: { razorpayOrder: order.id, amount: booking.totalAmount, ...split },
    create: { bookingId, razorpayOrder: order.id, amount: booking.totalAmount, ...split },
  });
  res.json({ order, keyId: env.RAZORPAY_KEY_ID, payment });
}));

router.post("/verify", asyncHandler(async (req, res) => {
  const data = z.object({
    bookingId: z.string(),
    razorpayOrderId: z.string(),
    razorpayPaymentId: z.string(),
    razorpaySignature: z.string(),
  }).parse(req.body);
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) throw new HttpError(503, "Payment provider not configured");
  const payment = await prisma.payment.findFirst({
    where: {
      bookingId: data.bookingId,
      razorpayOrder: data.razorpayOrderId,
      booking: { clientId: req.user!.id },
    },
    include: { booking: true },
  });
  if (!payment) throw new HttpError(404, "Payment order not found");
  if (payment.booking.status !== BookingStatus.PAYMENT_PENDING) throw new HttpError(400, "Payment is available only after the merchant requests online payment");
  const expected = crypto.createHmac("sha256", env.RAZORPAY_KEY_SECRET)
    .update(`${data.razorpayOrderId}|${data.razorpayPaymentId}`)
    .digest("hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  const receivedBuffer = Buffer.from(data.razorpaySignature, "hex");
  if (expectedBuffer.length !== receivedBuffer.length || !crypto.timingSafeEqual(expectedBuffer, receivedBuffer)) {
    throw new HttpError(400, "Invalid payment signature");
  }
  const razorpay = new Razorpay({ key_id: env.RAZORPAY_KEY_ID, key_secret: env.RAZORPAY_KEY_SECRET });
  const razorpayPayment = await razorpay.payments.fetch(data.razorpayPaymentId) as { order_id?: string; amount?: number; currency?: string; status?: string };
  if (
    razorpayPayment.order_id !== data.razorpayOrderId
    || razorpayPayment.status !== "captured"
    || razorpayPayment.currency !== payment.currency
    || razorpayPayment.amount !== expectedPaise(payment.amount)
  ) {
    throw new HttpError(400, "Payment provider confirmation does not match this booking");
  }
  const paidPayment = await markPaymentPaidOnline(data.bookingId, data.razorpayPaymentId);
  await sendOnlinePaymentNotifications(paidPayment);
  await auditLog({ req, action: "ONLINE_PAYMENT_VERIFIED", entity: "Payment", entityId: paidPayment.id, metadata: { razorpayPaymentId: data.razorpayPaymentId } });
  res.json(paidPayment);
}));

router.post("/cash", asyncHandler(async (req, res) => {
  const data = z.object({
    bookingId: z.string(),
    remark: z.string().trim().min(3, "Add a cash collection remark").max(300),
  }).parse(req.body);
  const booking = await prisma.booking.findFirst({
    where: { id: data.bookingId, salon: { ownerId: req.user!.id } },
    include: { payment: true, salon: true },
  });
  if (!booking) throw new HttpError(404, "Booking not found");
  if (req.user!.role !== UserRole.OWNER) throw new HttpError(403, "Only merchants can close bookings with cash");
  const cashClosableStatuses: BookingStatus[] = [BookingStatus.ACCEPTED, BookingStatus.PAYMENT_PENDING];
  if (!cashClosableStatuses.includes(booking.status)) {
    throw new HttpError(400, "Cash collection is allowed only for accepted bookings or bookings waiting for payment");
  }
  if (booking.payment?.status === "PAID") throw new HttpError(400, "This booking is already closed for payment");

  const commissionRate = await getPlatformCommissionRate();
  const split = splitAmount(booking.totalAmount, commissionRate);
  const admins = await adminIds();
  const payment = await prisma.$transaction(async (tx) => {
    const cashPayment = await tx.payment.upsert({
      where: { bookingId: booking.id },
      update: {
        amount: booking.totalAmount,
        status: "CREATED",
        method: "CASH",
        invoiceNumber: null,
        paidAt: null,
        cashRemark: data.remark,
        collectedById: req.user!.id,
        ...split,
      },
      create: {
        bookingId: booking.id,
        amount: booking.totalAmount,
        status: "CREATED",
        method: "CASH",
        cashRemark: data.remark,
        collectedById: req.user!.id,
        ...split,
      },
      include: paymentInclude,
    });
    await createNotifications([
      {
        userId: booking.clientId,
        type: "CASH_COLLECTED",
        title: "Confirm cash payment",
        message: `${booking.salon.name} requested cash closure of INR ${cashPayment.amount}. Confirm only after you paid.`,
        bookingId: booking.id,
        paymentId: cashPayment.id,
      },
      {
        userId: booking.salon.ownerId,
        type: "CASH_COLLECTED",
        title: "Cash confirmation requested",
        message: "The client must confirm the cash payment before this booking closes.",
        bookingId: booking.id,
        paymentId: cashPayment.id,
      },
      ...admins.map((userId) => ({
        userId,
        type: "CASH_COLLECTED" as const,
        title: "Cash confirmation pending",
        message: `Booking ${booking.id.slice(0, 8).toUpperCase()} cash closure requested. Remark: ${data.remark}`,
        bookingId: booking.id,
        paymentId: cashPayment.id,
      })),
    ], tx);
    return cashPayment;
  }, {
    timeout: 15000
  });
  await auditLog({ req, action: "CASH_PAYMENT_REQUESTED", entity: "Payment", entityId: payment.id, metadata: { bookingId: data.bookingId } });
  res.status(201).json(payment);
}));

router.post("/cash/confirm", asyncHandler(async (req, res) => {
  const data = z.object({ bookingId: z.string() }).parse(req.body);
  const booking = await prisma.booking.findFirst({
    where: { id: data.bookingId, clientId: req.user!.id },
    include: { payment: true, salon: true },
  });
  if (!booking) throw new HttpError(404, "Booking not found");
  if (!booking.payment || booking.payment.status !== "CREATED" || booking.payment.method !== "CASH") {
    throw new HttpError(400, "No pending cash confirmation found");
  }
  if (booking.status !== BookingStatus.ACCEPTED && booking.status !== BookingStatus.PAYMENT_PENDING) {
    throw new HttpError(400, "This booking cannot be closed with cash");
  }

  const admins = await adminIds();
  const payment = await prisma.$transaction(async (tx) => {
    const completedBooking = await tx.booking.update({ where: { id: booking.id }, data: { status: BookingStatus.COMPLETED }, include: { salon: true } });
    const cashPayment = await tx.payment.update({
      where: { bookingId: booking.id },
      data: { status: "PAID", invoiceNumber: invoiceNumber(), paidAt: new Date() },
      include: paymentInclude,
    });
    await createNotifications([
      {
        userId: completedBooking.clientId,
        type: "CASH_COLLECTED",
        title: "Cash payment confirmed",
        message: `Cash payment of INR ${cashPayment.amount} confirmed for ${completedBooking.salon.name}.`,
        bookingId: completedBooking.id,
        paymentId: cashPayment.id,
      },
      {
        userId: completedBooking.salon.ownerId,
        type: "CASH_COLLECTED",
        title: "Cash payment confirmed",
        message: "The client confirmed cash payment. Booking is closed.",
        bookingId: completedBooking.id,
        paymentId: cashPayment.id,
      },
      ...admins.map((userId) => ({
        userId,
        type: "CASH_COLLECTED" as const,
        title: "Cash payment closed",
        message: `Booking ${completedBooking.id.slice(0, 8).toUpperCase()} cash payment confirmed by client.`,
        bookingId: completedBooking.id,
        paymentId: cashPayment.id,
      })),
    ], tx);
    return cashPayment;
  }, {
    timeout: 15000
  });
  await auditLog({ req, action: "CASH_PAYMENT_CONFIRMED", entity: "Payment", entityId: payment.id, metadata: { bookingId: data.bookingId } });
  res.status(201).json(payment);
}));

router.post("/check-order-status", asyncHandler(async (req, res) => {
  const { bookingId } = z.object({ bookingId: z.string() }).parse(req.body);
  const payment = await prisma.payment.findUnique({
    where: { bookingId },
    include: { booking: true },
  });
  if (!payment) throw new HttpError(404, "Payment record not found");
  if (payment.status === "PAID") {
    res.json(payment);
    return;
  }
  if (!payment.razorpayOrder) {
    throw new HttpError(400, "No Razorpay order associated with this payment");
  }

  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) throw new HttpError(503, "Payment provider not configured");
  const razorpay = new Razorpay({ key_id: env.RAZORPAY_KEY_ID, key_secret: env.RAZORPAY_KEY_SECRET });

  const rpPayments = await razorpay.orders.fetchPayments(payment.razorpayOrder) as { items: Array<{ id: string; status: string }> };
  const successfulPayment = rpPayments.items.find((p) => p.status === "captured");
  if (successfulPayment) {
    const paidPayment = await markPaymentPaidOnline(bookingId, successfulPayment.id);
    await sendOnlinePaymentNotifications(paidPayment);
    await auditLog({ req, action: "PAYMENT_STATUS_CHECKED_SUCCESS", entity: "Payment", entityId: paidPayment.id, metadata: { razorpayPaymentId: successfulPayment.id } });
    res.json(paidPayment);
    return;
  }

  res.json(payment);
}));

export default router;
