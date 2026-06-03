import http from "http";
import jwt from "jsonwebtoken";
import { WebSocket, WebSocketServer } from "ws";
import { UserRole } from "@prisma/client";
import { env } from "../../config/env";
import { prisma } from "../../config/prisma";

type WsClient = {
  socket: WebSocket;
  user: { id: string; role: UserRole };
  ticketIds: Set<string>;
};

const clients = new Set<WsClient>();

function send(client: WsClient, payload: unknown) {
  if (client.socket.readyState === WebSocket.OPEN) {
    client.socket.send(JSON.stringify(payload));
  }
}

async function authUser(token: string) {
  const payload = jwt.verify(token, env.JWT_SECRET) as { sub?: string; role?: UserRole; sessionVersion?: number };
  if (!payload.sub) return null;
  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, role: true, sessionVersion: true, isSuspended: true, deletedAt: true },
  });
  if (!user || user.deletedAt || user.isSuspended || user.sessionVersion !== payload.sessionVersion) return null;
  return { id: user.id, role: user.role };
}

async function canJoinTicket(ticketId: string, user: { id: string; role: UserRole }) {
  const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId }, select: { clientId: true, adminId: true } });
  if (!ticket) return false;
  return user.role === UserRole.ADMIN || ticket.clientId === user.id || ticket.adminId === user.id;
}

export function attachSupportWebSocket(server: http.Server) {
  const wss = new WebSocketServer({ server, path: "/ws/support" });
  wss.on("connection", async (socket, request) => {
    const url = new URL(request.url ?? "", `http://${request.headers.host ?? "localhost"}`);
    const token = url.searchParams.get("token");
    if (!token) return socket.close(1008, "Authentication required");
    const user = await authUser(token).catch(() => null);
    if (!user) return socket.close(1008, "Invalid token");

    const client: WsClient = { socket, user, ticketIds: new Set() };
    clients.add(client);
    send(client, { type: "connected", userId: user.id });

    socket.on("message", async (raw) => {
      let payload: { type?: string; ticketId?: string };
      try {
        payload = JSON.parse(raw.toString()) as { type?: string; ticketId?: string };
      } catch {
        return send(client, { type: "error", error: "Invalid message" });
      }
      if (payload.type === "join" && payload.ticketId) {
        if (await canJoinTicket(payload.ticketId, user)) {
          client.ticketIds.add(payload.ticketId);
          send(client, { type: "joined", ticketId: payload.ticketId });
        } else {
          send(client, { type: "error", error: "Cannot join ticket" });
        }
      }
    });

    socket.on("close", () => clients.delete(client));
  });
}

export function broadcastSupportTicket(ticket: unknown) {
  for (const client of clients) {
    if (client.user.role === UserRole.ADMIN) send(client, { type: "ticket", ticket });
  }
}

export function broadcastSupportMessage(ticketId: string, message: unknown) {
  for (const client of clients) {
    if (client.ticketIds.has(ticketId) || client.user.role === UserRole.ADMIN) {
      send(client, { type: "message", ticketId, message });
    }
  }
}
