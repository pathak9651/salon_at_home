import { Prisma, UserRole } from "@prisma/client";
import { Request } from "express";
import { prisma } from "../config/prisma";

type AuditParams = {
  req?: Request;
  actorId?: string | null;
  actorRole?: UserRole | null;
  action: string;
  entity: string;
  entityId?: string | null;
  metadata?: Prisma.InputJsonObject;
};

export async function auditLog({ req, actorId, actorRole, action, entity, entityId, metadata }: AuditParams) {
  await prisma.auditLog.create({
    data: {
      actorId: actorId ?? req?.user?.id ?? null,
      actorRole: actorRole ?? req?.user?.role ?? null,
      action,
      entity,
      entityId: entityId ?? null,
      metadata: metadata ?? undefined,
      ipAddress: req?.ip ?? null,
      userAgent: req?.header("user-agent") ?? null,
    },
  }).catch((error: unknown) => {
    console.error("Audit log write failed", error);
  });
}
