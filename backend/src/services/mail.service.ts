import dns from "node:dns";
import nodemailer from "nodemailer";
import { env } from "../config/env";
import { HttpError } from "../utils/http-error";

dns.setDefaultResultOrder("ipv4first");

const transporter = env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS
  ? nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE === "true",
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
      tls: { servername: env.SMTP_HOST },
      connectionTimeout: 8_000,
      greetingTimeout: 8_000,
      socketTimeout: 10_000,
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

type InvoiceEmailData = {
  to: string;
  clientName?: string | null;
  invoiceNumber?: string | null;
  paidAt?: Date | string | null;
  amount: number;
  currency: string;
  method?: string | null;
  razorpayPayment?: string | null;
  bookingId: string;
  salonName: string;
  serviceNames: string[];
  scheduledFor: Date | string;
  serviceAddress: string;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDate(value?: Date | string | null) {
  if (!value) return "N/A";
  return new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

export async function sendPaymentInvoiceEmail(invoice: InvoiceEmailData) {
  if (!transporter) return false;

  const serviceList = invoice.serviceNames.length ? invoice.serviceNames.join(", ") : "Salon service";
  const subject = `Salon At Home invoice ${invoice.invoiceNumber ?? invoice.bookingId.slice(0, 8).toUpperCase()}`;
  const text = [
    `Hi ${invoice.clientName ?? "there"},`,
    "",
    "Your online payment was successful. Here is your invoice summary:",
    `Invoice: ${invoice.invoiceNumber ?? "N/A"}`,
    `Paid at: ${formatDate(invoice.paidAt)}`,
    `Salon: ${invoice.salonName}`,
    `Services: ${serviceList}`,
    `Scheduled for: ${formatDate(invoice.scheduledFor)}`,
    `Service address: ${invoice.serviceAddress}`,
    `Amount: ${invoice.currency} ${invoice.amount}`,
    `Payment method: ${invoice.method ?? "ONLINE"}`,
    invoice.razorpayPayment ? `Razorpay payment ID: ${invoice.razorpayPayment}` : "",
    "",
    "Thank you for using Salon At Home.",
  ].filter(Boolean).join("\n");

  const html = `
    <div style="font-family:Arial,sans-serif;color:#111827;line-height:1.5">
      <h2 style="margin:0 0 12px">Payment invoice</h2>
      <p>Hi ${escapeHtml(invoice.clientName ?? "there")}, your online payment was successful.</p>
      <table style="border-collapse:collapse;width:100%;max-width:620px">
        <tbody>
          <tr><td style="padding:8px;border:1px solid #e5e7eb">Invoice</td><td style="padding:8px;border:1px solid #e5e7eb"><strong>${escapeHtml(invoice.invoiceNumber ?? "N/A")}</strong></td></tr>
          <tr><td style="padding:8px;border:1px solid #e5e7eb">Paid at</td><td style="padding:8px;border:1px solid #e5e7eb">${escapeHtml(formatDate(invoice.paidAt))}</td></tr>
          <tr><td style="padding:8px;border:1px solid #e5e7eb">Salon</td><td style="padding:8px;border:1px solid #e5e7eb">${escapeHtml(invoice.salonName)}</td></tr>
          <tr><td style="padding:8px;border:1px solid #e5e7eb">Services</td><td style="padding:8px;border:1px solid #e5e7eb">${escapeHtml(serviceList)}</td></tr>
          <tr><td style="padding:8px;border:1px solid #e5e7eb">Scheduled for</td><td style="padding:8px;border:1px solid #e5e7eb">${escapeHtml(formatDate(invoice.scheduledFor))}</td></tr>
          <tr><td style="padding:8px;border:1px solid #e5e7eb">Address</td><td style="padding:8px;border:1px solid #e5e7eb">${escapeHtml(invoice.serviceAddress)}</td></tr>
          <tr><td style="padding:8px;border:1px solid #e5e7eb">Amount</td><td style="padding:8px;border:1px solid #e5e7eb"><strong>${escapeHtml(invoice.currency)} ${invoice.amount}</strong></td></tr>
          <tr><td style="padding:8px;border:1px solid #e5e7eb">Method</td><td style="padding:8px;border:1px solid #e5e7eb">${escapeHtml(invoice.method ?? "ONLINE")}</td></tr>
          ${invoice.razorpayPayment ? `<tr><td style="padding:8px;border:1px solid #e5e7eb">Razorpay payment ID</td><td style="padding:8px;border:1px solid #e5e7eb">${escapeHtml(invoice.razorpayPayment)}</td></tr>` : ""}
        </tbody>
      </table>
      <p style="margin-top:16px">Thank you for using Salon At Home.</p>
    </div>
  `;

  await transporter.sendMail({
    from: env.SMTP_FROM,
    to: invoice.to,
    subject,
    text,
    html,
  });
  return true;
}

type SafetyIssueEmailData = {
  reporterName?: string | null;
  reporterEmail?: string | null;
  reporterPhone: string;
  reporterRole: string;
  message: string;
};

export async function sendSafetyIssueEmail(report: SafetyIssueEmailData) {
  if (!transporter) throw new HttpError(503, "SMTP is not configured");

  const subject = "Salon At Home safety issue reported";
  const text = [
    "A safety issue was reported from Salon At Home.",
    "",
    `Reporter: ${report.reporterName ?? "N/A"}`,
    `Phone: ${report.reporterPhone}`,
    `Email: ${report.reporterEmail ?? "N/A"}`,
    `Role: ${report.reporterRole}`,
    "",
    "Issue:",
    report.message,
  ].join("\n");

  const html = `
    <div style="font-family:Arial,sans-serif;color:#111827;line-height:1.5">
      <h2 style="margin:0 0 12px">Safety issue reported</h2>
      <table style="border-collapse:collapse;width:100%;max-width:620px">
        <tbody>
          <tr><td style="padding:8px;border:1px solid #e5e7eb">Reporter</td><td style="padding:8px;border:1px solid #e5e7eb">${escapeHtml(report.reporterName ?? "N/A")}</td></tr>
          <tr><td style="padding:8px;border:1px solid #e5e7eb">Phone</td><td style="padding:8px;border:1px solid #e5e7eb">${escapeHtml(report.reporterPhone)}</td></tr>
          <tr><td style="padding:8px;border:1px solid #e5e7eb">Email</td><td style="padding:8px;border:1px solid #e5e7eb">${escapeHtml(report.reporterEmail ?? "N/A")}</td></tr>
          <tr><td style="padding:8px;border:1px solid #e5e7eb">Role</td><td style="padding:8px;border:1px solid #e5e7eb">${escapeHtml(report.reporterRole)}</td></tr>
        </tbody>
      </table>
      <p style="margin:16px 0 6px"><strong>Issue</strong></p>
      <p style="white-space:pre-wrap;padding:12px;border:1px solid #e5e7eb">${escapeHtml(report.message)}</p>
    </div>
  `;

  await transporter.sendMail({
    from: env.SMTP_FROM,
    to: "pathakayush8194@gmail.com",
    subject,
    text,
    html,
  });
  return true;
}
