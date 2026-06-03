import { UserRole } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { HttpError } from "../../utils/http-error";

export type SupportUser = { id: string; role: UserRole };

export const supportTicketInclude = {
  client: { select: { id: true, name: true, phone: true, email: true } },
  admin: { select: { id: true, name: true, phone: true, email: true } },
  messages: {
    include: { sender: { select: { id: true, name: true, role: true } } },
    orderBy: { createdAt: "asc" as const },
  },
};

export function supportTicketWhere(user: SupportUser) {
  if (user.role === UserRole.ADMIN) return {};
  return { clientId: user.id };
}

export async function getSupportTicketForUser(ticketId: string, user: SupportUser) {
  const ticket = await prisma.supportTicket.findFirst({
    where: { id: ticketId, ...supportTicketWhere(user) },
    include: supportTicketInclude,
  });
  if (!ticket) throw new HttpError(404, "Support ticket not found");
  return ticket;
}

export async function createSupportMessage(ticketId: string, sender: SupportUser, body: string) {
  const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId } });
  if (!ticket) throw new HttpError(404, "Support ticket not found");
  const isClient = ticket.clientId === sender.id;
  const isAssignedAdmin = sender.role === UserRole.ADMIN && ticket.adminId === sender.id;
  if (!isClient && !isAssignedAdmin) throw new HttpError(403, "You cannot send messages in this ticket");
  if (ticket.status !== "ACCEPTED") throw new HttpError(400, "Chat starts after admin accepts the ticket");

  return prisma.supportMessage.create({
    data: { ticketId, senderId: sender.id, body },
    include: { sender: { select: { id: true, name: true, role: true } } },
  });
}
