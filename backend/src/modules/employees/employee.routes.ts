import { UserRole } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma";
import { requireAuth, requireRole } from "../../middleware/auth.middleware";
import { asyncHandler } from "../../utils/async-handler";
import { HttpError } from "../../utils/http-error";

const router = Router();
router.use(requireAuth, requireRole(UserRole.OWNER));

const employeeSchema = z.object({
  salonId: z.string(),
  name: z.string().trim().min(2).max(80),
  phone: z.string().trim().max(20).optional().or(z.literal("")),
  email: z.string().trim().email().optional().or(z.literal("")),
  roleTitle: z.string().trim().max(60).optional().or(z.literal("")),
  specialties: z.string().trim().max(180).optional().or(z.literal("")),
  isActive: z.boolean().optional(),
});

function normalizeEmployee(data: {
  salonId: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  roleTitle?: string | null;
  specialties?: string | null;
  isActive?: boolean;
}) {
  return {
    ...data,
    phone: data.phone || null,
    email: data.email || null,
    roleTitle: data.roleTitle || null,
    specialties: data.specialties || null,
  };
}

router.get("/", asyncHandler(async (req, res) => {
  res.json(await prisma.employee.findMany({
    where: { salon: { ownerId: req.user!.id } },
    include: { salon: { select: { id: true, name: true } } },
    orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
  }));
}));

router.post("/", asyncHandler(async (req, res) => {
  const data = employeeSchema.parse(req.body);
  const salon = await prisma.salon.findFirst({ where: { id: data.salonId, ownerId: req.user!.id } });
  if (!salon) throw new HttpError(404, "Salon not found");
  res.status(201).json(await prisma.employee.create({
    data: normalizeEmployee(data),
    include: { salon: { select: { id: true, name: true } } },
  }));
}));

router.patch("/:id", asyncHandler(async (req, res) => {
  const existing = await prisma.employee.findFirst({
    where: { id: String(req.params.id), salon: { ownerId: req.user!.id } },
  });
  if (!existing) throw new HttpError(404, "Employee not found");

  const data = employeeSchema.partial().parse(req.body);
  if (data.salonId) {
    const salon = await prisma.salon.findFirst({ where: { id: data.salonId, ownerId: req.user!.id } });
    if (!salon) throw new HttpError(404, "Salon not found");
  }

  res.json(await prisma.employee.update({
    where: { id: existing.id },
    data: normalizeEmployee({
      salonId: data.salonId ?? existing.salonId,
      name: data.name ?? existing.name,
      phone: data.phone ?? existing.phone,
      email: data.email ?? existing.email,
      roleTitle: data.roleTitle ?? existing.roleTitle,
      specialties: data.specialties ?? existing.specialties,
      isActive: data.isActive ?? existing.isActive,
    }),
    include: { salon: { select: { id: true, name: true } } },
  }));
}));

router.delete("/:id", asyncHandler(async (req, res) => {
  const existing = await prisma.employee.findFirst({
    where: { id: String(req.params.id), salon: { ownerId: req.user!.id } },
    include: { _count: { select: { bookings: true } } },
  });
  if (!existing) throw new HttpError(404, "Employee not found");
  if (existing._count.bookings > 0) {
    await prisma.employee.update({ where: { id: existing.id }, data: { isActive: false } });
    return res.status(204).send();
  }
  await prisma.employee.delete({ where: { id: existing.id } });
  res.status(204).send();
}));

export default router;
