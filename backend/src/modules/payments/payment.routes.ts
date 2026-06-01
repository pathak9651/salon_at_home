import crypto from "node:crypto";
import { Router } from "express";
import Razorpay from "razorpay";
import { z } from "zod";
import { env } from "../../config/env";
import { prisma } from "../../config/prisma";
import { requireAuth } from "../../middleware/auth.middleware";
import { asyncHandler } from "../../utils/async-handler";
import { HttpError } from "../../utils/http-error";

const router = Router();
router.use(requireAuth);

router.post("/order", asyncHandler(async (req, res) => {
  const { bookingId } = z.object({ bookingId: z.string() }).parse(req.body);
  const booking = await prisma.booking.findFirst({ where: { id: bookingId, clientId: req.user!.id } });
  if (!booking) throw new HttpError(404, "Booking not found");
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) throw new HttpError(503, "Payment provider not configured");
  const razorpay = new Razorpay({ key_id: env.RAZORPAY_KEY_ID, key_secret: env.RAZORPAY_KEY_SECRET });
  const order = await razorpay.orders.create({ amount: booking.totalAmount * 100, currency: "INR" });
  await prisma.payment.upsert({
    where: { bookingId },
    update: { razorpayOrder: order.id, amount: booking.totalAmount },
    create: { bookingId, razorpayOrder: order.id, amount: booking.totalAmount },
  });
  res.json({ order, keyId: env.RAZORPAY_KEY_ID });
}));

router.post("/verify", asyncHandler(async (req, res) => {
  const data = z.object({
    bookingId: z.string(),
    razorpayOrderId: z.string(),
    razorpayPaymentId: z.string(),
    razorpaySignature: z.string(),
  }).parse(req.body);
  if (!env.RAZORPAY_KEY_SECRET) throw new HttpError(503, "Payment provider not configured");
  const expected = crypto.createHmac("sha256", env.RAZORPAY_KEY_SECRET)
    .update(`${data.razorpayOrderId}|${data.razorpayPaymentId}`)
    .digest("hex");
  if (expected !== data.razorpaySignature) throw new HttpError(400, "Invalid payment signature");
  res.json(await prisma.payment.update({
    where: { bookingId: data.bookingId },
    data: { status: "PAID", razorpayPayment: data.razorpayPaymentId },
  }));
}));

export default router;

