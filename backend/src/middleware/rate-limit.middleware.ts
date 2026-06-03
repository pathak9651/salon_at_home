import rateLimit from "express-rate-limit";
import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../config/prisma";

const IP_BLOCK_MS = 15 * 60 * 1000;

type IpBlockRecord = {
  blockedUntil: Date;
};

type IpBlockDelegate = {
  upsert(args: {
    where: { ip: string };
    update: { blockedUntil: Date; reason: string };
    create: { ip: string; blockedUntil: Date; reason: string };
  }): Promise<unknown>;
  findUnique(args: { where: { ip: string } }): Promise<IpBlockRecord | null>;
  delete(args: { where: { ip: string } }): Promise<unknown>;
};

const ipBlockStore = (prisma as unknown as { ipBlock: IpBlockDelegate }).ipBlock;

function clientIp(req: Request) {
  return req.ip ?? "unknown";
}

function authenticatedOrIpKey(req: Request) {
  const token = req.header("authorization")?.replace(/^Bearer\s+/i, "");
  const payload = token ? jwt.decode(token) : null;
  if (payload && typeof payload === "object" && typeof payload.sub === "string") {
    return `user:${payload.sub}`;
  }
  return `ip:${clientIp(req)}`;
}

async function blockIp(ip: string) {
  await ipBlockStore.upsert({
    where: { ip },
    update: { blockedUntil: new Date(Date.now() + IP_BLOCK_MS), reason: "rate_limit" },
    create: { ip, blockedUntil: new Date(Date.now() + IP_BLOCK_MS), reason: "rate_limit" },
  });
}

export async function ipBlocker(req: Request, res: Response, next: NextFunction) {
  const ip = clientIp(req);
  const block = await ipBlockStore.findUnique({ where: { ip } });
  if (!block) return next();
  if (block.blockedUntil <= new Date()) {
    await ipBlockStore.delete({ where: { ip } }).catch(() => undefined);
    return next();
  }
  const retryAfterSeconds = Math.ceil((block.blockedUntil.getTime() - Date.now()) / 1000);
  res.setHeader("Retry-After", retryAfterSeconds);
  return res.status(429).json({ error: "Too many requests from this IP. Try again later." });
}

async function blockAndReject(req: Request, res: Response) {
  const ip = clientIp(req);
  await blockIp(ip);
  res.setHeader("Retry-After", Math.ceil(IP_BLOCK_MS / 1000));
  res.status(429).json({ error: "Too many requests from this IP. Try again later." });
}

const standardOptions = {
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: authenticatedOrIpKey,
  message: { error: "Too many requests. Please try again later." },
};

const blockingOptions = {
  ...standardOptions,
  keyGenerator: clientIp,
  handler: blockAndReject,
};

export const authIpAbuseLimiter = rateLimit({
  ...blockingOptions,
  windowMs: 5 * 60 * 1000,
  limit: 300,
});

export const burstLimiter = rateLimit({
  ...standardOptions,
  windowMs: 60 * 1000,
  limit: 300,
});

export const globalLimiter = rateLimit({
  ...standardOptions,
  windowMs: 15 * 60 * 1000,
  limit: 1000,
});

export const authLimiter = rateLimit({
  ...standardOptions,
  windowMs: 15 * 60 * 1000,
  limit: 15,
});

export const loginLimiter = rateLimit({
  ...standardOptions,
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
});

export const otpLimiter = rateLimit({
  ...standardOptions,
  windowMs: 15 * 60 * 1000,
  limit: 5,
});

export const bookingLimiter = rateLimit({
  ...standardOptions,
  windowMs: 10 * 60 * 1000,
  limit: 20,
});

export const paymentLimiter = rateLimit({
  ...standardOptions,
  windowMs: 10 * 60 * 1000,
  limit: 12,
});

export const adminWriteLimiter = rateLimit({
  ...standardOptions,
  windowMs: 10 * 60 * 1000,
  limit: 30,
});

export const uploadLimiter = rateLimit({
  ...standardOptions,
  windowMs: 15 * 60 * 1000,
  limit: 20,
});
