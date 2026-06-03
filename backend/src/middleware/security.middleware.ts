import cors from "cors";
import { NextFunction, Request, Response } from "express";
import helmet from "helmet";
import { env } from "../config/env";
import { HttpError } from "../utils/http-error";

export const helmetMiddleware = helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
});

export const corsMiddleware = cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (env.NODE_ENV !== "production" && env.CORS_ORIGINS.length === 0) return callback(null, true);
    if (env.CORS_ORIGINS.includes(origin)) return callback(null, true);
    callback(new HttpError(403, "CORS origin is not allowed"));
  },
  credentials: true,
});

export function noStore(_req: Request, res: Response, next: NextFunction) {
  res.setHeader("Cache-Control", "no-store");
  next();
}
