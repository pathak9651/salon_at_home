import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
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
type SupportMessage = { id: string; body: string; createdAt: string; sender: { id: string; name?: string | null; role: string } };
type SupportTicket = {
  id: string;
  subject: string;
  status: "PENDING" | "ACCEPTED" | "CLOSED";
  client: { id: string; name?: string | null; phone: string; email?: string | null };
  admin?: { id: string; name?: string | null } | null;
  messages: SupportMessage[];
};

export function AdminHomeScreen({ token }: { token: string }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [salons, setSalons] = useState<AdminSalon[]>([]);
  const [supportTickets, setSupportTickets] = useState<SupportTicket[]>([]);
  const [activeTicketId, setActiveTicketId] = useState<string | null>(null);
  const [chatMessage, setChatMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
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
      setOverview(await apiRequest<Overview>("/admin/overview", { headers: { Authorization: `Bearer ${token}` } }));
      setUsers(await apiRequest<AdminUser[]>("/admin/users", { headers: { Authorization: `Bearer ${token}` } }));
      setSalons(await apiRequest<AdminSalon[]>("/admin/salons", { headers: { Authorization: `Bearer ${token}` } }));
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

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <ScreenHeader eyebrow="PLATFORM OPS // ADMIN" title="Command Center" subtitle="Monitor bookings, Razorpay payments, brokerage, and merchant payouts." />
      {!!error && <Text style={styles.error}>{error}</Text>}
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

    </ScrollView>
  );
}

function Metric({ label, value, styles }: { label: string; value: string; styles: ReturnType<typeof createStyles> }) {
  return <View style={styles.metric}><Text style={styles.label}>{label}</Text><Text style={styles.value}>{value}</Text></View>;
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    center: { flex: 1, alignItems: "center", justifyContent: "center" },
    page: { padding: 20, paddingBottom: 34 },
    error: { color: colors.danger, fontSize: 11, marginBottom: 10 },
    grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
    metric: { width: "48%", padding: 15, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panelRaised },
    label: { color: colors.cyan, fontSize: 8, letterSpacing: 1, fontWeight: "900" },
    value: { color: colors.text, fontSize: 18, fontWeight: "800", marginTop: 12 },
    section: { color: colors.text, fontSize: 12, fontWeight: "700", letterSpacing: 1.5, marginTop: 26, marginBottom: 10 },
    row: { flexDirection: "row", gap: 11, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel },
    copy: { flex: 1 },
    dot: { color: colors.green, fontSize: 18 },
    title: { color: colors.text, fontSize: 11, fontWeight: "800", letterSpacing: 1 },
    detail: { color: colors.muted, fontSize: 11, marginTop: 6, lineHeight: 17 },
    cashRemark: { color: colors.green, fontSize: 11, marginTop: 6, lineHeight: 17 },
    userCard: { padding: 14, marginBottom: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel },
    userTop: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
    active: { color: colors.green, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
    suspended: { color: colors.danger, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
    pending: { color: colors.amber, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
    actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
    actionButton: { minHeight: 38, justifyContent: "center", paddingHorizontal: 12, borderWidth: 1, borderColor: colors.border },
    input: { color: colors.text, padding: 12, marginTop: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel, fontSize: 12 },
    chatPanel: { padding: 10, marginTop: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bar },
    myMessage: { alignSelf: "flex-end", maxWidth: "84%", padding: 10, marginBottom: 8, backgroundColor: colors.activePanel },
    theirMessage: { alignSelf: "flex-start", maxWidth: "84%", padding: 10, marginBottom: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel },
    messageAuthor: { color: colors.cyan, fontSize: 9, fontWeight: "900", marginBottom: 4 },
    messageBody: { color: colors.text, fontSize: 12, lineHeight: 17 },
    suspendText: { color: colors.amber, fontSize: 10, fontWeight: "900", letterSpacing: 1 },
    activateText: { color: colors.green, fontSize: 10, fontWeight: "900", letterSpacing: 1 },
    deleteText: { color: colors.danger, fontSize: 10, fontWeight: "900", letterSpacing: 1 },
    empty: { color: colors.muted, fontSize: 12, paddingVertical: 8 },
  });
}
