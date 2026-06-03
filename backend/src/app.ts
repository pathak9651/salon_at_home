import express from "express";
import path from "path";
import { env } from "./config/env";
import adminRoutes from "./modules/admin/admin.routes";
import authRoutes from "./modules/auth/auth.routes";
import bookingRoutes from "./modules/bookings/booking.routes";
import employeeRoutes from "./modules/employees/employee.routes";
import notificationRoutes from "./modules/notifications/notification.routes";
import paymentRoutes, { razorpayWebhookHandler } from "./modules/payments/payment.routes";
import profileRoutes from "./modules/profile/profile.routes";
import reviewRoutes from "./modules/reviews/review.routes";
import salonRoutes from "./modules/salons/salon.routes";
import { errorHandler } from "./middleware/error.middleware";
import { authIpAbuseLimiter, bookingLimiter, burstLimiter, globalLimiter, ipBlocker, paymentLimiter, uploadLimiter } from "./middleware/rate-limit.middleware";
import { rejectUnsupportedContentType, requestTimeout } from "./middleware/request-guard.middleware";
import { corsMiddleware, helmetMiddleware, noStore } from "./middleware/security.middleware";

export const app = express();

if (env.TRUST_PROXY) app.set("trust proxy", 1);
app.use(helmetMiddleware);
app.use(corsMiddleware);
app.use(requestTimeout);
app.use(burstLimiter);
app.use(globalLimiter);
app.post("/api/payments/webhook", express.raw({ type: "application/json", limit: "256kb" }), razorpayWebhookHandler);
app.use(rejectUnsupportedContentType);
app.use(express.json({ limit: env.JSON_BODY_LIMIT }));
app.use(noStore);
app.use("/uploads", express.static(path.join(process.cwd(), "uploads"), {
  fallthrough: false,
  maxAge: env.NODE_ENV === "production" ? "7d" : 0,
  setHeaders(res) {
    res.setHeader("X-Content-Type-Options", "nosniff");
  },
}));

app.get("/health", (_req, res) => res.json({ status: "ok", service: "salon-at-home-api" }));
app.use("/api/auth", ipBlocker, authIpAbuseLimiter, authRoutes);
app.use("/api/profile/photo", uploadLimiter);
app.use("/api/profile", profileRoutes);
app.use("/api/salons/:id/images/upload", uploadLimiter);
app.use("/api/salons", salonRoutes);
app.use("/api/bookings", bookingLimiter, bookingRoutes);
app.use("/api/employees", employeeRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/payments", paymentLimiter, paymentRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/admin", adminRoutes);
app.use(errorHandler);
