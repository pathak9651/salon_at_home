import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { WS_ORIGIN, apiRequest } from "../../api/client";
import { ThemeColors, useTheme } from "../../utils/theme";
import { ScreenHeader } from "../common/ScreenHeader";

type Overview = {
  users: number;
  salons: number;
  bookings: number;
  revenue: number;
  brokerage: number;
  merchantPayouts: number;
  onlinePayments: number;
  cashPayments: number;
};

type AdminUser = {
  id: string;
  name?: string | null;
  phone: string;
  email?: string | null;
  emailVerified: boolean;
  role: "CLIENT" | "OWNER" | "ADMIN";
  isSuspended: boolean;
  createdAt: string;
  _count?: { salons: number; bookings: number };
};

type AdminSalon = {
  id: string;
  name: string;
  address: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  isVerified: boolean;
  createdAt: string;
  rating?: number | null;
  paidRevenue?: number;
  activeBookings?: number;
  completedBookings?: number;
  owner?: { name?: string | null; phone: string; email?: string | null; isSuspended: boolean };
  _count?: { bookings: number; services: number; employees: number; reviews: number };
};
type AdminBooking = {
  id: string;
  scheduledAt: string;
  status: string;
  totalAmount: number;
  payment?: AdminPayment | null;
};
type AdminPayment = {
  id: string;
  amount: number;
  status: string;
  method?: "ONLINE" | "CASH" | null;
  platformFee: number;
  merchantAmount: number;
  paidAt?: string | null;
};
type SupportMessage = { id: string; body: string; createdAt: string; sender: { id: string; name?: string | null; role: string } };
type SupportTicket = {
  id: string;
  subject: string;
  status: "PENDING" | "ACCEPTED" | "CLOSED";
  client: { id: string; name?: string | null; phone: string; email?: string | null };
  admin?: { id: string; name?: string | null } | null;
  messages: SupportMessage[];
};
type AnalyticsRange = "DAY" | "WEEK" | "MONTH" | "YEAR";
type AdminSection = "support" | "users" | "owners" | "salons" | null;
type AdminTrendPoint = { label: string; requests: number; completed: number; revenue: number; brokerage: number };

const analyticsRanges: AnalyticsRange[] = ["DAY", "WEEK", "MONTH", "YEAR"];

export function AdminHomeScreen({ token }: { token: string }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [salons, setSalons] = useState<AdminSalon[]>([]);
  const [bookings, setBookings] = useState<AdminBooking[]>([]);
  const [payments, setPayments] = useState<AdminPayment[]>([]);
  const [supportTickets, setSupportTickets] = useState<SupportTicket[]>([]);
  const [activeTicketId, setActiveTicketId] = useState<string | null>(null);
  const [chatMessage, setChatMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [analyticsRange, setAnalyticsRange] = useState<AnalyticsRange>("WEEK");
  const [activeSection, setActiveSection] = useState<AdminSection>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    void loadOverview();
  }, []);

  useEffect(() => {
    const socket = new WebSocket(`${WS_ORIGIN}/ws/support?token=${encodeURIComponent(token)}`);
    wsRef.current = socket;
    socket.onmessage = (event) => {
      const payload = JSON.parse(event.data) as { type?: string; ticket?: SupportTicket; ticketId?: string; message?: SupportMessage };
      if (payload.type === "ticket" && payload.ticket) {
        setSupportTickets((current) => {
          const exists = current.some((ticket) => ticket.id === payload.ticket!.id);
          return exists ? current.map((ticket) => ticket.id === payload.ticket!.id ? payload.ticket! : ticket) : [payload.ticket!, ...current];
        });
      }
      if (payload.type === "message" && payload.ticketId && payload.message) {
        setSupportTickets((current) => current.map((ticket) => ticket.id === payload.ticketId
          ? { ...ticket, messages: ticket.messages.some((message) => message.id === payload.message!.id) ? ticket.messages : [...ticket.messages, payload.message!] }
          : ticket));
      }
    };
    return () => {
      socket.close();
      wsRef.current = null;
    };
  }, [token]);

  async function loadOverview() {
    setLoading(true);
    setError("");
    try {
      const [nextOverview, nextUsers, nextSalons, nextBookings, nextPayments] = await Promise.all([
        apiRequest<Overview>("/admin/overview", { headers: { Authorization: `Bearer ${token}` } }),
        apiRequest<AdminUser[]>("/admin/users", { headers: { Authorization: `Bearer ${token}` } }),
        apiRequest<AdminSalon[]>("/admin/salons", { headers: { Authorization: `Bearer ${token}` } }),
        apiRequest<AdminBooking[]>("/admin/bookings?limit=50", { headers: { Authorization: `Bearer ${token}` } }),
        apiRequest<AdminPayment[]>("/admin/payments?limit=50", { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      setOverview(nextOverview);
      setUsers(nextUsers);
      setSalons(nextSalons);
      setBookings(nextBookings);
      setPayments(nextPayments);
      const tickets = await apiRequest<SupportTicket[]>("/support/tickets", { headers: { Authorization: `Bearer ${token}` } });
      setSupportTickets(tickets);
      tickets.forEach((ticket) => wsRef.current?.send(JSON.stringify({ type: "join", ticketId: ticket.id })));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load admin overview");
    } finally {
      setLoading(false);
    }
  }

  async function updateSuspension(user: AdminUser, isSuspended: boolean) {
    setSaving(true);
    setError("");
    try {
      await apiRequest(`/admin/users/${user.id}/suspension`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ isSuspended }),
      });
      await loadOverview();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Could not update account");
    } finally {
      setSaving(false);
    }
  }

  async function deleteUser(user: AdminUser) {
    setSaving(true);
    setError("");
    try {
      await apiRequest(`/admin/users/${user.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      await loadOverview();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Could not delete account");
    } finally {
      setSaving(false);
    }
  }

  async function updateSalonStatus(salon: AdminSalon, status: AdminSalon["status"]) {
    setSaving(true);
    setError("");
    try {
      await apiRequest(`/admin/salons/${salon.id}/status`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status }),
      });
      await loadOverview();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Could not update salon");
    } finally {
      setSaving(false);
    }
  }

  async function acceptTicket(ticket: SupportTicket) {
    setSaving(true);
    setError("");
    try {
      const updated = await apiRequest<SupportTicket>(`/support/tickets/${ticket.id}/accept`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      setSupportTickets((current) => current.map((item) => item.id === updated.id ? updated : item));
      setActiveTicketId(updated.id);
      wsRef.current?.send(JSON.stringify({ type: "join", ticketId: updated.id }));
    } catch (ticketError) {
      setError(ticketError instanceof Error ? ticketError.message : "Could not accept ticket");
    } finally {
      setSaving(false);
    }
  }

  async function sendTicketMessage(ticketId: string) {
    if (!chatMessage.trim()) return;
    const body = chatMessage.trim();
    setChatMessage("");
    try {
      const message = await apiRequest<SupportMessage>(`/support/tickets/${ticketId}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ body }),
      });
      setSupportTickets((current) => current.map((ticket) => ticket.id === ticketId ? { ...ticket, messages: ticket.messages.some((item) => item.id === message.id) ? ticket.messages : [...ticket.messages, message] } : ticket));
    } catch (chatError) {
      setError(chatError instanceof Error ? chatError.message : "Could not send message");
    }
  }

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.cyan} /></View>;

  const trendPoints = buildAdminTrendPoints(bookings, payments, analyticsRange);
  const rangeTotals = trendPoints.reduce((totals, point) => ({
    requests: totals.requests + point.requests,
    completed: totals.completed + point.completed,
    revenue: totals.revenue + point.revenue,
    brokerage: totals.brokerage + point.brokerage,
  }), { requests: 0, completed: 0, revenue: 0, brokerage: 0 });
  const approvedSalons = salons.filter((salon) => salon.status === "APPROVED").length;
  const pendingSalons = salons.filter((salon) => salon.status === "PENDING").length;
  const ownerUsers = users.filter((user) => user.role === "OWNER").length;
  const clientUsers = users.filter((user) => user.role === "CLIENT").length;
  const platformMix = [
    { label: "Clients", value: clientUsers, color: colors.cyan },
    { label: "Owners", value: ownerUsers, color: colors.amber },
    { label: "Approved salons", value: approvedSalons, color: colors.green },
    { label: "Pending salons", value: pendingSalons, color: colors.muted },
  ];

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <ScreenHeader eyebrow="PLATFORM OPS // ADMIN" title="Command Center" subtitle="Monitor bookings, Razorpay payments, brokerage, and merchant payouts." />
      {!!error && <Text style={styles.error}>{error}</Text>}
      <View style={styles.adminHero}>
        <View style={styles.heroCopy}>
          <Text style={styles.heroKicker}>HELLO ADMIN</Text>
          <Text style={styles.heroTitle}>BarberX welcomes you</Text>
          <Text style={styles.heroText}>Keep the platform healthy, approve real salons, resolve support, and watch revenue move in real time.</Text>
        </View>
        <View style={styles.heroArt}>
          <View style={styles.heroScreen}>
            <View style={styles.heroScreenTop} />
            <View style={styles.heroGraphRow}>
              <View style={[styles.heroGraphBar, { height: 26, backgroundColor: colors.cyan }]} />
              <View style={[styles.heroGraphBar, { height: 42, backgroundColor: colors.green }]} />
              <View style={[styles.heroGraphBar, { height: 34, backgroundColor: colors.amber }]} />
            </View>
          </View>
          <View style={styles.heroBadgeIcon}><Ionicons name="shield-checkmark" size={24} color={colors.buttonText} /></View>
          <View style={styles.heroSmallIcon}><Ionicons name="storefront-outline" size={18} color={colors.cyan} /></View>
        </View>
      </View>
      <View style={styles.bannerGrid}>
        <View style={styles.infoBanner}>
          <Ionicons name="headset-outline" size={24} color={colors.cyan} />
          <View style={styles.bannerCopy}>
            <Text style={styles.bannerTitle}>{supportTickets.filter((ticket) => ticket.status === "PENDING").length} support waiting</Text>
            <Text style={styles.bannerText}>Accept live chats faster and keep client trust high.</Text>
          </View>
        </View>
        <View style={styles.infoBanner}>
          <Ionicons name="pulse-outline" size={24} color={colors.green} />
          <View style={styles.bannerCopy}>
            <Text style={styles.bannerTitle}>{pendingSalons} salons need review</Text>
            <Text style={styles.bannerText}>Approve genuine partners and remove suspicious listings.</Text>
          </View>
        </View>
      </View>
      <View style={styles.grid}>
        <Metric styles={styles} label="TOTAL COLLECTION" value={`INR ${overview?.revenue ?? 0}`} />
        <Metric styles={styles} label="ADMIN BROKERAGE" value={`INR ${overview?.brokerage ?? 0}`} />
        <Metric styles={styles} label="MERCHANT PAYOUTS" value={`INR ${overview?.merchantPayouts ?? 0}`} />
        <Metric styles={styles} label="ONLINE CLOSED" value={String(overview?.onlinePayments ?? 0)} />
        <Metric styles={styles} label="CASH CLOSED" value={String(overview?.cashPayments ?? 0)} />
        <Metric styles={styles} label="BOOKINGS" value={String(overview?.bookings ?? 0)} />
        <Metric styles={styles} label="SALONS" value={String(overview?.salons ?? 0)} />
        <Metric styles={styles} label="USERS" value={String(overview?.users ?? 0)} />
      </View>
      <Text style={styles.section}>PLATFORM VISUAL INSIGHTS</Text>
      <View style={styles.rangeTabs}>
        {analyticsRanges.map((range) => (
          <TouchableOpacity key={range} onPress={() => setAnalyticsRange(range)} style={[styles.rangeTab, analyticsRange === range && styles.rangeTabActive]}>
            <Text style={[styles.rangeText, analyticsRange === range && styles.rangeTextActive]}>{range}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.visualPanel}>
        <View style={styles.visualTop}>
          <View>
            <Text style={styles.visualTitle}>Platform movement</Text>
            <Text style={styles.visualSub}>{analyticsRange.toLowerCase()} view across bookings, completion, revenue, and brokerage</Text>
          </View>
          <Text style={styles.visualAmount}>INR {rangeTotals.brokerage}</Text>
        </View>
        <View style={styles.visualSummary}>
          <AdminMiniStat styles={styles} label="Requests" value={rangeTotals.requests} />
          <AdminMiniStat styles={styles} label="Completed" value={rangeTotals.completed} />
          <AdminMiniStat styles={styles} label="Revenue" value={`INR ${rangeTotals.revenue}`} />
          <AdminMiniStat styles={styles} label="Brokerage" value={`INR ${rangeTotals.brokerage}`} />
        </View>
        <AdminFlowChart points={trendPoints} styles={styles} colors={colors} />
        <AdminRevenueLanes points={trendPoints} styles={styles} colors={colors} />
        <PlatformMixDiagram items={platformMix} styles={styles} />
      </View>
      <Text style={styles.section}>ADMIN CONTROLS</Text>
      <View style={styles.quickGrid}>
        <AdminQuickTile icon="headset-outline" title="Live support" active={activeSection === "support"} onPress={() => setActiveSection((current) => current === "support" ? null : "support")} styles={styles} colors={colors} />
        <AdminQuickTile icon="people-outline" title="User management" active={activeSection === "users"} onPress={() => setActiveSection((current) => current === "users" ? null : "users")} styles={styles} colors={colors} />
        <AdminQuickTile icon="person-add-outline" title="Salon owners" active={activeSection === "owners"} onPress={() => setActiveSection((current) => current === "owners" ? null : "owners")} styles={styles} colors={colors} />
        <AdminQuickTile icon="storefront-outline" title="Salon management" active={activeSection === "salons"} onPress={() => setActiveSection((current) => current === "salons" ? null : "salons")} styles={styles} colors={colors} />
      </View>

      {activeSection === "support" && <>
        <Text style={styles.section}>LIVE SUPPORT</Text>
        {supportTickets.length ? supportTickets.map((ticket) => (
        <View style={styles.userCard} key={ticket.id}>
          <View style={styles.userTop}>
            <View style={styles.copy}>
              <Text style={styles.title}>{ticket.subject}</Text>
              <Text style={styles.detail}>Client: {ticket.client.name ?? ticket.client.phone} | {ticket.client.email ?? "No email"}</Text>
              <Text style={styles.detail}>Messages: {ticket.messages.length} | Admin: {ticket.admin?.name ?? "Not assigned"}</Text>
            </View>
            <Text style={ticket.status === "ACCEPTED" ? styles.active : ticket.status === "PENDING" ? styles.pending : styles.suspended}>{ticket.status}</Text>
          </View>
          <View style={styles.actions}>
            {ticket.status === "PENDING" && <TouchableOpacity disabled={saving} onPress={() => void acceptTicket(ticket)} style={styles.actionButton}><Text style={styles.activateText}>ACCEPT CHAT</Text></TouchableOpacity>}
            {ticket.status === "ACCEPTED" && <TouchableOpacity onPress={() => { setActiveTicketId(ticket.id); wsRef.current?.send(JSON.stringify({ type: "join", ticketId: ticket.id })); }} style={styles.actionButton}><Text style={styles.activateText}>OPEN CHAT</Text></TouchableOpacity>}
          </View>
          {activeTicketId === ticket.id && ticket.status === "ACCEPTED" && (
            <View style={styles.chatPanel}>
              {ticket.messages.map((message) => (
                <View key={message.id} style={message.sender.role === "ADMIN" ? styles.myMessage : styles.theirMessage}>
                  <Text style={styles.messageAuthor}>{message.sender.role === "ADMIN" ? "Admin" : message.sender.name ?? "Client"}</Text>
                  <Text style={styles.messageBody}>{message.body}</Text>
                </View>
              ))}
              <TextInput value={chatMessage} onChangeText={setChatMessage} placeholder="Type reply" placeholderTextColor={colors.placeholder} style={styles.input} />
              <TouchableOpacity onPress={() => void sendTicketMessage(ticket.id)} style={styles.actionButton}><Text style={styles.activateText}>SEND</Text></TouchableOpacity>
            </View>
          )}
        </View>
        )) : <Text style={styles.empty}>No support tickets yet.</Text>}
      </>}

      {activeSection === "users" && <>
        <Text style={styles.section}>USER MANAGEMENT</Text>
        {users.length ? users.map((user) => (
        <View style={styles.userCard} key={user.id}>
          <View style={styles.userTop}>
            <View style={styles.copy}>
              <Text style={styles.title}>{user.name ?? user.email ?? user.phone}</Text>
              <Text style={styles.detail}>{user.role === "OWNER" ? "SALON OWNER" : user.role} | {user.emailVerified ? "Verified" : "Email pending"}</Text>
              <Text style={styles.detail}>{[user.phone, user.email].filter(Boolean).join(" | ")}</Text>
              <Text style={styles.detail}>{user._count?.salons ?? 0} salon(s) | {user._count?.bookings ?? 0} booking(s)</Text>
            </View>
            <Text style={user.isSuspended ? styles.suspended : styles.active}>{user.isSuspended ? "SUSPENDED" : "ACTIVE"}</Text>
          </View>
          <View style={styles.actions}>
            <TouchableOpacity disabled={saving} onPress={() => void updateSuspension(user, !user.isSuspended)} style={styles.actionButton}>
              <Text style={user.isSuspended ? styles.activateText : styles.suspendText}>{user.isSuspended ? "REACTIVATE" : "SUSPEND"}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              disabled={saving}
              onPress={() => Alert.alert("Delete account?", "This permanently removes the account and related data. This cannot be undone.", [{ text: "Cancel" }, { text: "Delete", style: "destructive", onPress: () => void deleteUser(user) }])}
              style={styles.actionButton}
            >
              <Text style={styles.deleteText}>DELETE</Text>
            </TouchableOpacity>
          </View>
        </View>
        )) : <Text style={styles.empty}>No users found.</Text>}
      </>}

      {activeSection === "owners" && <>
        <Text style={styles.section}>SALON OWNERS</Text>
        {users.filter((user) => user.role === "OWNER").length ? users.filter((user) => user.role === "OWNER").map((user) => (
        <View style={styles.row} key={`owner-${user.id}`}>
          <Text style={styles.dot}>{user.isSuspended ? "!" : "+"}</Text>
          <View style={styles.copy}>
            <Text style={styles.title}>{user.name ?? user.phone}</Text>
            <Text style={styles.detail}>{user._count?.salons ?? 0} salon(s) | {user._count?.bookings ?? 0} booking(s)</Text>
            <Text style={styles.detail}>{user.isSuspended ? "Account suspended" : "Account active"}</Text>
          </View>
        </View>
        )) : <Text style={styles.empty}>No salon owners found.</Text>}
      </>}

      {activeSection === "salons" && <>
        <Text style={styles.section}>SALON MANAGEMENT</Text>
        {salons.length ? salons.map((salon) => (
        <View style={styles.userCard} key={salon.id}>
          <View style={styles.userTop}>
            <View style={styles.copy}>
              <Text style={styles.title}>{salon.name}</Text>
              <Text style={styles.detail}>Owner: {salon.owner?.name ?? salon.owner?.phone ?? "N/A"}{salon.owner?.isSuspended ? " | Owner suspended" : ""}</Text>
              <Text style={styles.detail}>{salon.address}</Text>
              <Text style={styles.detail}>{salon._count?.services ?? 0} services | {salon._count?.employees ?? 0} employees | {salon._count?.reviews ?? 0} reviews</Text>
              <Text style={styles.detail}>{salon.activeBookings ?? 0} active | {salon.completedBookings ?? 0} completed | INR {salon.paidRevenue ?? 0} paid</Text>
              <Text style={styles.detail}>Rating: {salon.rating ? salon.rating.toFixed(1) : "NEW"}</Text>
            </View>
            <Text style={salon.status === "APPROVED" ? styles.active : salon.status === "REJECTED" ? styles.suspended : styles.pending}>{salon.status}</Text>
          </View>
          <View style={styles.actions}>
            <TouchableOpacity disabled={saving || salon.status === "APPROVED"} onPress={() => void updateSalonStatus(salon, "APPROVED")} style={styles.actionButton}>
              <Text style={styles.activateText}>APPROVE</Text>
            </TouchableOpacity>
            <TouchableOpacity
              disabled={saving || salon.status === "REJECTED"}
              onPress={() => Alert.alert("Reject fake salon?", "Rejected salons will be hidden from client discovery.", [{ text: "Cancel" }, { text: "Reject", style: "destructive", onPress: () => void updateSalonStatus(salon, "REJECTED") }])}
              style={styles.actionButton}
            >
              <Text style={styles.deleteText}>REJECT</Text>
            </TouchableOpacity>
            {salon.status !== "PENDING" && <TouchableOpacity disabled={saving} onPress={() => void updateSalonStatus(salon, "PENDING")} style={styles.actionButton}>
              <Text style={styles.suspendText}>MARK PENDING</Text>
            </TouchableOpacity>}
          </View>
        </View>
        )) : <Text style={styles.empty}>No salons found.</Text>}
      </>}

    </ScrollView>
  );
}

function Metric({ label, value, styles }: { label: string; value: string; styles: ReturnType<typeof createStyles> }) {
  return <View style={styles.metric}><Text style={styles.label}>{label}</Text><Text style={styles.value}>{value}</Text></View>;
}

function AdminQuickTile({
  icon,
  title,
  active,
  onPress,
  styles,
  colors,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  title: string;
  active: boolean;
  onPress: () => void;
  styles: ReturnType<typeof createStyles>;
  colors: ThemeColors;
}) {
  return (
    <TouchableOpacity accessibilityRole="button" onPress={onPress} style={[styles.quickTile, active && styles.quickTileActive]}>
      <Ionicons name={icon} size={28} color={active ? colors.cyan : colors.text} />
      <Text style={styles.quickTitle}>{title}</Text>
      <Ionicons name={active ? "chevron-up" : "chevron-down"} size={18} color={colors.muted} />
    </TouchableOpacity>
  );
}

function AdminMiniStat({ label, value, styles }: { label: string; value: string | number; styles: ReturnType<typeof createStyles> }) {
  return <View style={styles.miniStat}><Text style={styles.miniValue}>{value}</Text><Text style={styles.miniLabel}>{label}</Text></View>;
}

function AdminFlowChart({ points, styles, colors }: { points: AdminTrendPoint[]; styles: ReturnType<typeof createStyles>; colors: ThemeColors }) {
  const maxValue = Math.max(1, ...points.map((point) => Math.max(point.requests, point.completed)));
  return (
    <View style={styles.chartBlock}>
      <Text style={styles.chartTitle}>Request flow diagram</Text>
      <View style={styles.flowRows}>
        {points.map((point, index) => {
          const requestWidth = `${Math.max(8, Math.round((point.requests / maxValue) * 100))}%` as `${number}%`;
          const completedWidth = `${Math.max(8, Math.round((point.completed / maxValue) * 100))}%` as `${number}%`;
          return (
            <View style={styles.flowRow} key={`${point.label}-${index}`}>
              <Text style={styles.flowLabel}>{point.label}</Text>
              <View style={styles.flowTrack}>
                <View style={[styles.flowBarRequest, { width: requestWidth }]} />
                <View style={[styles.flowBarComplete, { width: completedWidth }]} />
              </View>
            </View>
          );
        })}
      </View>
      <View style={styles.legendRow}>
        <AdminLegend styles={styles} color={colors.amber} label="All requests" />
        <AdminLegend styles={styles} color={colors.green} label="Completed" />
      </View>
    </View>
  );
}

function AdminRevenueLanes({ points, styles, colors }: { points: AdminTrendPoint[]; styles: ReturnType<typeof createStyles>; colors: ThemeColors }) {
  const maxValue = Math.max(1, ...points.map((point) => Math.max(point.revenue, point.brokerage)));
  return (
    <View style={styles.chartBlock}>
      <Text style={styles.chartTitle}>Revenue and brokerage lanes</Text>
      <View style={styles.laneChart}>
        {points.map((point, index) => {
          const revenueHeight = Math.max(8, Math.round((point.revenue / maxValue) * 82));
          const brokerageHeight = Math.max(8, Math.round((point.brokerage / maxValue) * 82));
          return (
            <View style={styles.laneColumn} key={`${point.label}-${index}`}>
              <View style={styles.laneBars}>
                <View style={[styles.revenueLane, { height: revenueHeight }]} />
                <View style={[styles.brokerageLane, { height: brokerageHeight }]} />
              </View>
              <Text style={styles.laneLabel}>{point.label}</Text>
            </View>
          );
        })}
      </View>
      <View style={styles.legendRow}>
        <AdminLegend styles={styles} color={colors.cyan} label="Revenue" />
        <AdminLegend styles={styles} color={colors.green} label="Brokerage" />
      </View>
    </View>
  );
}

function PlatformMixDiagram({ items, styles }: { items: Array<{ label: string; value: number; color: string }>; styles: ReturnType<typeof createStyles> }) {
  const total = Math.max(1, items.reduce((sum, item) => sum + item.value, 0));
  return (
    <View style={styles.mixPanel}>
      <Text style={styles.chartTitle}>Platform composition</Text>
      <View style={styles.mixGrid}>
        {items.map((item) => (
          <View style={styles.mixTile} key={item.label}>
            <View style={[styles.mixRing, { borderColor: item.color }]}>
              <Text style={styles.mixPercent}>{Math.round((item.value / total) * 100)}%</Text>
            </View>
            <Text style={styles.mixLabel}>{item.label}</Text>
            <Text style={styles.mixValue}>{item.value}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function AdminLegend({ color, label, styles }: { color: string; label: string; styles: ReturnType<typeof createStyles> }) {
  return <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: color }]} /><Text style={styles.legendText}>{label}</Text></View>;
}

function buildAdminTrendPoints(bookings: AdminBooking[], payments: AdminPayment[], range: AnalyticsRange) {
  return buildRangeDescriptors(range).map((descriptor) => {
    const rangeBookings = bookings.filter((booking) => isInRange(new Date(booking.scheduledAt), descriptor.start, descriptor.end));
    const rangePayments = payments.filter((payment) => payment.status === "PAID" && payment.paidAt && isInRange(new Date(payment.paidAt), descriptor.start, descriptor.end));
    return {
      label: descriptor.label,
      requests: rangeBookings.length,
      completed: rangeBookings.filter((booking) => booking.status === "COMPLETED").length,
      revenue: rangePayments.reduce((sum, payment) => sum + payment.amount, 0),
      brokerage: rangePayments.reduce((sum, payment) => sum + payment.platformFee, 0),
    };
  });
}

function buildRangeDescriptors(range: AnalyticsRange) {
  const now = new Date();
  if (range === "DAY") {
    return Array.from({ length: 6 }, (_, index) => {
      const start = new Date(now);
      start.setHours(Math.max(0, now.getHours() - (5 - index) * 4), 0, 0, 0);
      const end = new Date(start);
      end.setHours(start.getHours() + 4, 0, 0, 0);
      return { label: `${String(start.getHours()).padStart(2, "0")}:00`, start, end };
    });
  }
  if (range === "WEEK") {
    return Array.from({ length: 7 }, (_, index) => {
      const start = startOfDay(addDays(now, index - 6));
      return { label: start.toLocaleDateString("en-IN", { weekday: "short" }), start, end: addDays(start, 1) };
    });
  }
  if (range === "MONTH") {
    return Array.from({ length: 4 }, (_, index) => {
      const start = startOfDay(addDays(now, (index - 3) * 7));
      return { label: `W${index + 1}`, start, end: addDays(start, 7) };
    });
  }
  return Array.from({ length: 12 }, (_, index) => {
    const start = new Date(now.getFullYear(), index, 1);
    return { label: start.toLocaleDateString("en-IN", { month: "short" }), start, end: new Date(now.getFullYear(), index + 1, 1) };
  });
}

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function isInRange(date: Date, start: Date, end: Date) {
  return date >= start && date < end;
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    center: { flex: 1, alignItems: "center", justifyContent: "center" },
    page: { padding: 20, paddingBottom: 34 },
    error: { color: colors.danger, fontSize: 11, marginBottom: 10 },
    adminHero: { minHeight: 188, flexDirection: "row", alignItems: "center", gap: 12, padding: 16, marginBottom: 12, overflow: "hidden", borderWidth: 1, borderColor: colors.heroBorder, borderRadius: 8, backgroundColor: colors.panelRaised },
    heroCopy: { flex: 1.18 },
    heroKicker: { color: colors.amber, fontSize: 9, fontWeight: "900", letterSpacing: 1.4 },
    heroTitle: { color: colors.text, fontSize: 25, fontWeight: "900", lineHeight: 31, marginTop: 8 },
    heroText: { color: colors.muted, fontSize: 11, fontWeight: "700", lineHeight: 17, marginTop: 9 },
    heroArt: { width: 126, height: 136, justifyContent: "center", alignItems: "center" },
    heroScreen: { width: 104, height: 88, padding: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.panel },
    heroScreenTop: { width: 58, height: 8, borderRadius: 999, backgroundColor: colors.activePanel },
    heroGraphRow: { flex: 1, flexDirection: "row", alignItems: "flex-end", justifyContent: "center", gap: 7, marginTop: 10 },
    heroGraphBar: { width: 13, borderTopLeftRadius: 8, borderTopRightRadius: 8 },
    heroBadgeIcon: { position: "absolute", right: 4, top: 6, width: 48, height: 48, alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: colors.panelRaised, borderRadius: 24, backgroundColor: colors.green },
    heroSmallIcon: { position: "absolute", left: 0, bottom: 8, width: 38, height: 38, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.heroBorder, borderRadius: 8, backgroundColor: colors.panel },
    bannerGrid: { gap: 10, marginBottom: 12 },
    infoBanner: { flexDirection: "row", alignItems: "center", gap: 12, padding: 13, borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.panel },
    bannerCopy: { flex: 1 },
    bannerTitle: { color: colors.text, fontSize: 13, fontWeight: "900" },
    bannerText: { color: colors.muted, fontSize: 10, fontWeight: "700", lineHeight: 15, marginTop: 4 },
    grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
    metric: { width: "48%", padding: 15, borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.panelRaised },
    label: { color: colors.cyan, fontSize: 8, letterSpacing: 1, fontWeight: "900" },
    value: { color: colors.text, fontSize: 18, fontWeight: "800", marginTop: 12 },
    section: { color: colors.text, fontSize: 12, fontWeight: "700", letterSpacing: 1.5, marginTop: 26, marginBottom: 10 },
    rangeTabs: { flexDirection: "row", gap: 8, marginBottom: 10 },
    rangeTab: { flex: 1, minHeight: 38, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.panel },
    rangeTabActive: { borderColor: colors.cyan, backgroundColor: colors.activePanel },
    rangeText: { color: colors.muted, fontSize: 10, fontWeight: "900", letterSpacing: 1 },
    rangeTextActive: { color: colors.cyan },
    visualPanel: { padding: 14, borderWidth: 1, borderColor: colors.heroBorder, borderRadius: 8, backgroundColor: colors.panelRaised },
    visualTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10 },
    visualTitle: { color: colors.text, fontSize: 15, fontWeight: "900" },
    visualSub: { color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 5 },
    visualAmount: { color: colors.green, fontSize: 14, fontWeight: "900" },
    visualSummary: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
    miniStat: { flexGrow: 1, flexBasis: "47%", minHeight: 58, justifyContent: "center", padding: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.panel },
    miniValue: { color: colors.text, fontSize: 13, fontWeight: "900" },
    miniLabel: { color: colors.muted, fontSize: 9, fontWeight: "800", marginTop: 6 },
    chartBlock: { marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border },
    chartTitle: { color: colors.text, fontSize: 12, fontWeight: "900", letterSpacing: 0.8 },
    flowRows: { gap: 9, marginTop: 12 },
    flowRow: { flexDirection: "row", alignItems: "center", gap: 9 },
    flowLabel: { width: 42, color: colors.muted, fontSize: 9, fontWeight: "900" },
    flowTrack: { flex: 1, height: 24, justifyContent: "center", gap: 3 },
    flowBarRequest: { height: 8, borderRadius: 999, backgroundColor: colors.amber },
    flowBarComplete: { height: 8, borderRadius: 999, backgroundColor: colors.green },
    laneChart: { minHeight: 128, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 7, marginTop: 12 },
    laneColumn: { flex: 1, alignItems: "center", justifyContent: "flex-end" },
    laneBars: { height: 92, flexDirection: "row", alignItems: "flex-end", justifyContent: "center", gap: 4 },
    revenueLane: { width: 9, borderTopLeftRadius: 8, borderTopRightRadius: 8, backgroundColor: colors.cyan },
    brokerageLane: { width: 9, borderTopLeftRadius: 8, borderTopRightRadius: 8, backgroundColor: colors.green },
    laneLabel: { color: colors.muted, fontSize: 8, fontWeight: "900", marginTop: 8 },
    legendRow: { flexDirection: "row", flexWrap: "wrap", gap: 14, marginTop: 10 },
    legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
    legendDot: { width: 8, height: 8, borderRadius: 4 },
    legendText: { color: colors.muted, fontSize: 9, fontWeight: "800" },
    mixPanel: { marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border },
    mixGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 12 },
    mixTile: { flexGrow: 1, flexBasis: "46%", alignItems: "center", padding: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.panel },
    mixRing: { width: 62, height: 62, alignItems: "center", justifyContent: "center", borderWidth: 5, borderRadius: 31 },
    mixPercent: { color: colors.text, fontSize: 12, fontWeight: "900" },
    mixLabel: { color: colors.muted, fontSize: 10, fontWeight: "800", marginTop: 9 },
    mixValue: { color: colors.cyan, fontSize: 14, fontWeight: "900", marginTop: 4 },
    row: { flexDirection: "row", gap: 11, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.panel },
    quickGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
    quickTile: { flexGrow: 1, flexBasis: "47%", minHeight: 116, justifyContent: "space-between", padding: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.panelRaised },
    quickTileActive: { borderColor: colors.cyan, backgroundColor: colors.activePanel },
    quickTitle: { color: colors.text, fontSize: 15, fontWeight: "900", lineHeight: 20 },
    copy: { flex: 1 },
    dot: { color: colors.green, fontSize: 18 },
    title: { color: colors.text, fontSize: 11, fontWeight: "800", letterSpacing: 1 },
    detail: { color: colors.muted, fontSize: 11, marginTop: 6, lineHeight: 17 },
    cashRemark: { color: colors.green, fontSize: 11, marginTop: 6, lineHeight: 17 },
    userCard: { padding: 14, marginBottom: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.panel },
    userTop: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
    active: { color: colors.green, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
    suspended: { color: colors.danger, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
    pending: { color: colors.amber, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
    actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
    actionButton: { minHeight: 38, justifyContent: "center", paddingHorizontal: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 8 },
    input: { color: colors.text, padding: 12, marginTop: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.panel, fontSize: 12 },
    chatPanel: { padding: 10, marginTop: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.bar },
    myMessage: { alignSelf: "flex-end", maxWidth: "84%", padding: 10, marginBottom: 8, borderRadius: 8, backgroundColor: colors.activePanel },
    theirMessage: { alignSelf: "flex-start", maxWidth: "84%", padding: 10, marginBottom: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.panel },
    messageAuthor: { color: colors.cyan, fontSize: 9, fontWeight: "900", marginBottom: 4 },
    messageBody: { color: colors.text, fontSize: 12, lineHeight: 17 },
    suspendText: { color: colors.amber, fontSize: 10, fontWeight: "900", letterSpacing: 1 },
    activateText: { color: colors.green, fontSize: 10, fontWeight: "900", letterSpacing: 1 },
    deleteText: { color: colors.danger, fontSize: 10, fontWeight: "900", letterSpacing: 1 },
    empty: { color: colors.muted, fontSize: 12, paddingVertical: 8 },
  });
}
