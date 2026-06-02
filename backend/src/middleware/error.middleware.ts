import { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { HttpError } from "../utils/http-error";

export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (error instanceof ZodError) {
    const details = error.flatten();
    const firstFieldError = Object.entries(details.fieldErrors).find(([, messages]) => messages?.length);
    const message = firstFieldError
      ? `${firstFieldError[0]}: ${firstFieldError[1]?.[0]}`
      : details.formErrors[0] ?? "Validation failed";
    return res.status(400).json({ error: message, details });
  }
  if (error instanceof HttpError) {
    return res.status(error.status).json({ error: error.message });
  }
  console.error(error);
  res.status(500).json({ error: "Internal server error" });
}
