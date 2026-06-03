import { NextFunction, Request, Response } from "express";
import { HttpError } from "../utils/http-error";

const REQUEST_TIMEOUT_MS = 15_000;

export function requestTimeout(req: Request, res: Response, next: NextFunction) {
  req.setTimeout(REQUEST_TIMEOUT_MS, () => {
    if (!res.headersSent) {
      res.status(408).json({ error: "Request timeout" });
    }
    req.destroy();
  });
  res.setTimeout(REQUEST_TIMEOUT_MS, () => {
    if (!res.headersSent) {
      res.status(503).json({ error: "Response timeout" });
    }
  });
  next();
}

export function rejectUnsupportedContentType(req: Request, _res: Response, next: NextFunction) {
  if (["POST", "PUT", "PATCH"].includes(req.method)) {
    const contentType = req.header("content-type") ?? "";
    if (!contentType) return next(new HttpError(415, "Content-Type header is required"));
    if (
      !contentType.startsWith("application/json")
      && !contentType.startsWith("image/jpeg")
      && !contentType.startsWith("image/png")
      && !contentType.startsWith("image/webp")
    ) {
      return next(new HttpError(415, "Unsupported Content-Type"));
    }
  }
  next();
}
