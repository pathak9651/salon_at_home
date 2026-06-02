import { NotificationType, Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "../../config/prisma";

type NotificationInput = {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  bookingId?: string;
  paymentId?: string;
};

type PrismaWriter = PrismaClient | Prisma.TransactionClient;

export async function createNotification(input: NotificationInput, client: PrismaWriter = prisma) {
  return client.notification.create({ data: input });
}

export async function createNotifications(inputs: NotificationInput[], client: PrismaWriter = prisma) {
  if (!inputs.length) return { count: 0 };
  return client.notification.createMany({ data: inputs });
}
