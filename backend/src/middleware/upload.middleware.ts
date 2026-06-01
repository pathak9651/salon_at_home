import { NextFunction, Request, Response } from "express";
import { HttpError } from "../utils/http-error";

export function requireImageUpload(req: Request, _res: Response, next: NextFunction) {
  const contentType = req.header("content-type") ?? "";
  if (!contentType.startsWith("image/")) {
    return next(new HttpError(415, "Only image uploads are supported"));
  }
  next();
}

