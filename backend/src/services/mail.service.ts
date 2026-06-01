import nodemailer from "nodemailer";
import { env } from "../config/env";
import { HttpError } from "../utils/http-error";

const transporter = env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS
  ? nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE === "true",
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    })
  : null;

export async function sendAuthCode(email: string, code: string, purpose: "verify" | "reset") {
  if (!transporter) {
    if (env.OTP_BYPASS_CODE) return;
    throw new HttpError(503, "SMTP is not configured");
  }

  const isVerification = purpose === "verify";
  await transporter.sendMail({
    from: env.SMTP_FROM,
    to: email,
    subject: isVerification ? "Verify your Salon At Home account" : "Reset your Salon At Home password",
    text: `Your Salon At Home ${isVerification ? "verification" : "password reset"} code is ${code}. It expires in 10 minutes.`,
    html: `<p>Your Salon At Home ${isVerification ? "verification" : "password reset"} code is:</p><h2>${code}</h2><p>This code expires in 10 minutes.</p>`,
  });
}
