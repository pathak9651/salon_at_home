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
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_SECURE: z.enum(["true", "false"]).default("false"),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  EMAIL_HOST: z.string().optional(),
  EMAIL_PORT: z.coerce.number().optional(),
  EMAIL_USER: z.string().optional(),
  EMAIL_PASS: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
});

const parsedEnv = envSchema.parse(process.env);

export const env = {
  ...parsedEnv,
  SMTP_HOST: parsedEnv.SMTP_HOST ?? parsedEnv.EMAIL_HOST,
  SMTP_PORT: parsedEnv.SMTP_HOST ? parsedEnv.SMTP_PORT : (parsedEnv.EMAIL_PORT ?? parsedEnv.SMTP_PORT),
  SMTP_USER: parsedEnv.SMTP_USER ?? parsedEnv.EMAIL_USER,
  SMTP_PASS: parsedEnv.SMTP_PASS ?? parsedEnv.EMAIL_PASS,
  SMTP_FROM: parsedEnv.SMTP_FROM ?? parsedEnv.EMAIL_FROM ?? "Salon At Home <no-reply@salonathome.local>",
};
