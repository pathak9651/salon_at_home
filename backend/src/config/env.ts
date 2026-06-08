import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  CORS_ORIGINS: z.string().optional(),
  TRUST_PROXY: z.coerce.boolean().default(false),
  JSON_BODY_LIMIT: z.string().default("1mb"),
  OTP_BYPASS_CODE: z.string().length(6).optional(),
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  PLATFORM_COMMISSION_PERCENT: z.coerce.number().min(0).max(100).default(10),
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
  RESEND_API_KEY: z.string().optional(),
  EMAIL_HOST: z.string().optional(),
  EMAIL_PORT: z.coerce.number().optional(),
  EMAIL_USER: z.string().optional(),
  EMAIL_PASS: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
}).superRefine((env, ctx) => {
  if (env.NODE_ENV !== "production") return;
  if (env.OTP_BYPASS_CODE) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["OTP_BYPASS_CODE"], message: "OTP_BYPASS_CODE must not be set in production" });
  }
  if (env.JWT_SECRET.length < 32) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["JWT_SECRET"], message: "JWT_SECRET must be at least 32 characters in production" });
  }
  if (
    !env.RESEND_API_KEY
    && !((env.SMTP_HOST || env.EMAIL_HOST) && (env.SMTP_USER || env.EMAIL_USER) && (env.SMTP_PASS || env.EMAIL_PASS))
  ) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["SMTP_HOST"], message: "Email configuration is required in production" });
  }
});

const parsedEnv = envSchema.parse(process.env);

export const env = {
  ...parsedEnv,
  SMTP_HOST: parsedEnv.SMTP_HOST ?? parsedEnv.EMAIL_HOST,
  SMTP_PORT: parsedEnv.SMTP_HOST ? parsedEnv.SMTP_PORT : (parsedEnv.EMAIL_PORT ?? parsedEnv.SMTP_PORT),
  SMTP_USER: parsedEnv.SMTP_USER ?? parsedEnv.EMAIL_USER,
  SMTP_PASS: parsedEnv.SMTP_PASS ?? parsedEnv.EMAIL_PASS,
  SMTP_FROM: parsedEnv.SMTP_FROM ?? parsedEnv.EMAIL_FROM ?? "Salon At Home <no-reply@salonathome.local>",
  RESEND_API_KEY: parsedEnv.RESEND_API_KEY,
  CORS_ORIGINS: (parsedEnv.CORS_ORIGINS ?? "").split(",").map((origin) => origin.trim()).filter(Boolean),
};
