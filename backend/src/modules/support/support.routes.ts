import { SupportTicketStatus, UserRole } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma";
import { requireAuth } from "../../middleware/auth.middleware";
import { asyncHandler } from "../../utils/async-handler";
import { HttpError } from "../../utils/http-error";
import { createSupportMessage, getSupportTicketForUser, supportTicketInclude, supportTicketWhere } from "./support.service";
import { broadcastSupportMessage, broadcastSupportTicket } from "./support.ws";

const router = Router();
router.use(requireAuth);

router.get("/tickets", asyncHandler(async (req, res) => {
  const tickets = await prisma.supportTicket.findMany({
    where: supportTicketWhere(req.user!),
    include: supportTicketInclude,
    orderBy: { updatedAt: "desc" },
    take: 50,
  });
  res.json(tickets);
}));

router.post("/tickets", asyncHandler(async (req, res) => {
  const data = z.object({
    subject: z.string().trim().min(3).max(120),
    message: z.string().trim().min(2).max(1000),
  }).parse(req.body);
  const ticket = await prisma.$transaction(async (tx) => {
    const created = await tx.supportTicket.create({
      data: {
        subject: data.subject,
        clientId: req.user!.id,
        messages: { create: { senderId: req.user!.id, body: data.message } },
      },
      include: supportTicketInclude,
    });
    return created;
  });
  broadcastSupportTicket(ticket);
  res.status(201).json(ticket);
}));

router.post("/tickets/:id/accept", asyncHandler(async (req, res) => {
  if (req.user!.role !== UserRole.ADMIN) throw new HttpError(403, "Only admins can accept support tickets");
  const existing = await prisma.supportTicket.findUnique({ where: { id: String(req.params.id) } });
  if (!existing) throw new HttpError(404, "Support ticket not found");
  if (existing.status !== SupportTicketStatus.PENDING) throw new HttpError(400, "Only pending tickets can be accepted");
  const ticket = await prisma.supportTicket.update({
    where: { id: existing.id },
    data: { status: "ACCEPTED", adminId: req.user!.id, acceptedAt: new Date() },
    include: supportTicketInclude,
  });
  broadcastSupportTicket(ticket);
  res.json(ticket);
}));

router.get("/tickets/:id/messages", asyncHandler(async (req, res) => {
  const ticket = await getSupportTicketForUser(String(req.params.id), req.user!);
  res.json(ticket.messages);
}));

router.post("/tickets/:id/messages", asyncHandler(async (req, res) => {
  const data = z.object({ body: z.string().trim().min(1).max(1000) }).parse(req.body);
  const message = await createSupportMessage(String(req.params.id), req.user!, data.body);
  broadcastSupportMessage(String(req.params.id), message);
  res.status(201).json(message);
}));

router.post("/tickets/:id/close", asyncHandler(async (req, res) => {
  const ticket = await getSupportTicketForUser(String(req.params.id), req.user!);
  const canClose = req.user!.role === UserRole.ADMIN || ticket.clientId === req.user!.id;
  if (!canClose) throw new HttpError(403, "You cannot close this ticket");
  const updated = await prisma.supportTicket.update({
    where: { id: ticket.id },
    data: { status: "CLOSED", closedAt: new Date() },
    include: supportTicketInclude,
  });
  broadcastSupportTicket(updated);
  res.json(updated);
}));

export default router;
