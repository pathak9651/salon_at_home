import { UserRole } from "@prisma/client";
import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { prisma } from "../config/prisma";
import { HttpError } from "../utils/http-error";

type TokenPayload = {
  sub: string;
  role: UserRole;
  sessionVersion: number;
};

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const token = req.header("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return next(new HttpError(401, "Authentication required"));

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as TokenPayload;
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, role: true, sessionVersion: true, isSuspended: true, deletedAt: true },
    });
    if (!user || user.deletedAt || user.sessionVersion !== payload.sessionVersion) {
      return next(new HttpError(401, "Invalid or expired token"));
    }
    if (user.isSuspended) return next(new HttpError(403, "Account suspended"));
    req.user = { id: user.id, role: user.role };
    next();
  } catch {
    next(new HttpError(401, "Invalid or expired token"));
  }
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(new HttpError(403, "Insufficient permissions"));
    }
    next();
  };
}
