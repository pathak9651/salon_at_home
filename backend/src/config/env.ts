import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  OTP_BYPASS_CODE: z.string().length(6).optional(),
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  ADMIN_NAME: z.string().default("Platform Admin"),
  ADMIN_EMAIL: z.string().email().default("admin@salonathome.local"),
  ADMIN_PHONE: z.string().min(10).max(15).default("9999999999"),
  ADMIN_PASSWORD: z.string().min(8).default("ChangeMe123!"),
});

export const env = envSchema.parse(process.env);
