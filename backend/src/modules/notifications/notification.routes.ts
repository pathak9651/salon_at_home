import { Router } from "express";
import { prisma } from "../../config/prisma";
import { requireAuth } from "../../middleware/auth.middleware";
import { asyncHandler } from "../../utils/async-handler";
import { HttpError } from "../../utils/http-error";

const router = Router();
router.use(requireAuth);

router.get("/", asyncHandler(async (req, res) => {
  const notifications = await prisma.notification.findMany({
    where: { userId: req.user!.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  const unreadCount = await prisma.notification.count({ where: { userId: req.user!.id, readAt: null } });
  res.json({ notifications, unreadCount });
}));

router.patch("/:id/read", asyncHandler(async (req, res) => {
  const notification = await prisma.notification.findFirst({ where: { id: String(req.params.id), userId: req.user!.id } });
  if (!notification) throw new HttpError(404, "Notification not found");
  res.json(await prisma.notification.update({
    where: { id: notification.id },
    data: { readAt: notification.readAt ?? new Date() },
  }));
}));

router.patch("/read-all", asyncHandler(async (req, res) => {
  await prisma.notification.updateMany({
    where: { userId: req.user!.id, readAt: null },
    data: { readAt: new Date() },
  });
  res.json({ message: "Notifications marked as read" });
}));

export default router;
