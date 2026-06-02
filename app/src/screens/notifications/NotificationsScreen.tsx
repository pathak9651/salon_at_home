import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { apiRequest } from "../../api/client";
import { ThemeColors, useTheme } from "../../utils/theme";
import { ScreenHeader } from "../common/ScreenHeader";

export type NotificationItem = {
  id: string;
  type: string;
  title: string;
  message: string;
  readAt?: string | null;
  bookingId?: string | null;
  paymentId?: string | null;
  createdAt: string;
};

type NotificationResponse = {
  notifications: NotificationItem[];
  unreadCount: number;
};

export function NotificationsScreen({ token, onUnreadChanged }: { token: string; onUnreadChanged?: (count: number) => void }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void loadNotifications();
  }, []);

  async function loadNotifications() {
    setLoading(true);
    setError("");
    try {
      const response = await apiRequest<NotificationResponse>("/notifications", { headers: { Authorization: `Bearer ${token}` } });
      setNotifications(response.notifications);
      setUnreadCount(response.unreadCount);
      onUnreadChanged?.(response.unreadCount);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load notifications");
    } finally {
      setLoading(false);
    }
  }

  async function markRead(id: string) {
    setSaving(true);
    setError("");
    try {
      await apiRequest(`/notifications/${id}/read`, { method: "PATCH", headers: { Authorization: `Bearer ${token}` } });
      await loadNotifications();
    } catch (readError) {
      setError(readError instanceof Error ? readError.message : "Could not mark notification read");
    } finally {
      setSaving(false);
    }
  }

  async function markAllRead() {
    setSaving(true);
    setError("");
    try {
      await apiRequest("/notifications/read-all", { method: "PATCH", headers: { Authorization: `Bearer ${token}` } });
      await loadNotifications();
    } catch (readError) {
      setError(readError instanceof Error ? readError.message : "Could not mark notifications read");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.cyan} /></View>;

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <ScreenHeader eyebrow="ACCOUNT // NOTIFICATIONS" title="Notifications" subtitle="Booking, service, and payment updates appear here." />
      <View style={styles.topRow}>
        <Text style={styles.unread}>{unreadCount} UNREAD</Text>
        <TouchableOpacity disabled={saving || !unreadCount} onPress={() => void markAllRead()} style={styles.secondary}><Text style={styles.secondaryText}>MARK ALL READ</Text></TouchableOpacity>
      </View>
      {!!error && <Text style={styles.error}>{error}</Text>}
      {notifications.length ? notifications.map((item) => (
        <TouchableOpacity disabled={saving || !!item.readAt} onPress={() => void markRead(item.id)} style={[styles.card, !item.readAt && styles.unreadCard]} key={item.id}>
          <View style={styles.cardTop}>
            <Text style={styles.type}>{labelForType(item.type)}</Text>
            {!item.readAt && <Text style={styles.badge}>NEW</Text>}
          </View>
          <Text style={styles.title}>{item.title}</Text>
          <Text style={styles.message}>{item.message}</Text>
          <Text style={styles.time}>{new Date(item.createdAt).toLocaleString()}</Text>
        </TouchableOpacity>
      )) : <Text style={styles.empty}>No notifications yet.</Text>}
    </ScrollView>
  );
}

function labelForType(type: string) {
  return type.replace(/_/g, " ");
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    center: { flex: 1, alignItems: "center", justifyContent: "center" },
    page: { padding: 20, paddingBottom: 34 },
    topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 12 },
    unread: { color: colors.green, fontSize: 10, fontWeight: "900", letterSpacing: 1.2 },
    secondary: { alignItems: "center", justifyContent: "center", minHeight: 38, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.cyan },
    secondaryText: { color: colors.cyan, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
    error: { color: colors.danger, fontSize: 11, marginBottom: 10 },
    card: { padding: 14, marginBottom: 9, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel },
    unreadCard: { borderColor: colors.cyan, backgroundColor: colors.activePanel },
    cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
    type: { color: colors.amber, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
    badge: { color: colors.green, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
    title: { color: colors.text, fontSize: 14, fontWeight: "900", marginTop: 8 },
    message: { color: colors.muted, fontSize: 11, lineHeight: 17, marginTop: 6 },
    time: { color: colors.placeholder, fontSize: 9, marginTop: 10 },
    empty: { color: colors.muted, fontSize: 12, paddingVertical: 8 },
  });
}
