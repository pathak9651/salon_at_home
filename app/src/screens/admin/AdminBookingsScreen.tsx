import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { apiRequest } from "../../api/client";
import { ThemeColors, useTheme } from "../../utils/theme";
import { ScreenHeader } from "../common/ScreenHeader";

type AdminBooking = {
  id: string;
  scheduledAt: string;
  createdAt: string;
  updatedAt: string;
  address: string;
  instructions?: string | null;
  totalAmount: number;
  status: string;
  disputeStatus: "NONE" | "OPEN" | "RESOLVED";
  disputeNote?: string | null;
  client?: { name?: string | null; phone: string; email?: string | null; isSuspended: boolean } | null;
  salon?: { name: string; owner?: { name?: string | null; phone: string; isSuspended: boolean } };
  employee?: { name: string } | null;
  service?: { name: string };
  services?: Array<{ service: { name: string }; price: number }>;
  payment?: { status: string; method?: string | null; platformFee: number; merchantAmount: number; cashRemark?: string | null } | null;
  review?: { rating: number; comment?: string | null } | null;
};

type Payment = {
  id: string;
  amount: number;
  method?: string | null;
  invoiceNumber?: string | null;
  cashRemark?: string | null;
  platformFee: number;
  merchantAmount: number;
  booking?: {
    client?: { name?: string | null; phone: string } | null;
    salon?: { name: string; owner?: { name?: string | null; phone: string } };
  };
};

export function AdminBookingsScreen({ token }: { token: string }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const [bookings, setBookings] = useState<AdminBooking[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void loadBookings();
  }, []);

  async function loadBookings() {
    setLoading(true);
    setError("");
    try {
      const [nextBookings, nextPayments] = await Promise.all([
        apiRequest<AdminBooking[]>("/admin/bookings", { headers: { Authorization: `Bearer ${token}` } }),
        apiRequest<Payment[]>("/admin/payments", { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      setBookings(nextBookings);
      setPayments(nextPayments);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load admin bookings");
    } finally {
      setLoading(false);
    }
  }

  async function updateDispute(booking: AdminBooking, disputeStatus: AdminBooking["disputeStatus"], disputeNote: string) {
    setSaving(true);
    setError("");
    try {
      await apiRequest(`/admin/bookings/${booking.id}/dispute`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ disputeStatus, disputeNote }),
      });
      await loadBookings();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Could not update dispute");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.cyan} /></View>;

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <ScreenHeader eyebrow="PLATFORM OPS // BOOKINGS" title="Booking management" subtitle="View all bookings, monitor activity, and resolve disputes." />
      {!!error && <Text style={styles.error}>{error}</Text>}
      {bookings.length ? bookings.map((booking) => (
        <View style={styles.card} key={booking.id}>
          <View style={styles.top}>
            <View style={styles.copy}>
              <Text style={styles.title}>{serviceNames(booking)}</Text>
              <Text style={styles.detail}>{booking.salon?.name ?? "Salon"} | {new Date(booking.scheduledAt).toLocaleString()}</Text>
              <Text style={styles.detail}>Client: {booking.client?.name ?? booking.client?.phone ?? "N/A"}{booking.client?.isSuspended ? " | Suspended" : ""}</Text>
              <Text style={styles.detail}>Owner: {booking.salon?.owner?.name ?? booking.salon?.owner?.phone ?? "N/A"}{booking.salon?.owner?.isSuspended ? " | Suspended" : ""}</Text>
              <Text style={styles.detail}>Employee: {booking.employee?.name ?? "Not assigned"}</Text>
              <Text style={styles.detail}>Payment: {booking.payment?.status ?? "N/A"}{booking.payment?.method ? ` | ${booking.payment.method}` : ""} | INR {booking.totalAmount}</Text>
              <Text style={styles.detail}>Created {new Date(booking.createdAt).toLocaleString()} | Updated {new Date(booking.updatedAt).toLocaleString()}</Text>
              {!!booking.instructions && <Text style={styles.detail}>Instructions: {booking.instructions}</Text>}
              {!!booking.review && <Text style={styles.detail}>Review: {booking.review.rating}/5{booking.review.comment ? ` | ${booking.review.comment}` : ""}</Text>}
              {!!booking.payment?.cashRemark && <Text style={styles.cashRemark}>Cash remark: {booking.payment.cashRemark}</Text>}
              {!!booking.disputeNote && <Text style={styles.cashRemark}>Dispute note: {booking.disputeNote}</Text>}
            </View>
            <View style={styles.side}>
              <Text style={styles.status}>{booking.status}</Text>
              <Text style={booking.disputeStatus === "OPEN" ? styles.open : booking.disputeStatus === "RESOLVED" ? styles.resolved : styles.none}>{booking.disputeStatus}</Text>
            </View>
          </View>
          <View style={styles.actions}>
            <TouchableOpacity disabled={saving || booking.disputeStatus === "OPEN"} onPress={() => void updateDispute(booking, "OPEN", "Admin opened dispute for review")} style={styles.actionButton}>
              <Text style={styles.warnText}>OPEN DISPUTE</Text>
            </TouchableOpacity>
            <TouchableOpacity disabled={saving || booking.disputeStatus === "RESOLVED"} onPress={() => void updateDispute(booking, "RESOLVED", booking.disputeNote ?? "Resolved by admin")} style={styles.actionButton}>
              <Text style={styles.goodText}>RESOLVE</Text>
            </TouchableOpacity>
            {booking.disputeStatus !== "NONE" && <TouchableOpacity disabled={saving} onPress={() => void updateDispute(booking, "NONE", "")} style={styles.actionButton}>
              <Text style={styles.dangerText}>CLEAR</Text>
            </TouchableOpacity>}
          </View>
        </View>
      )) : <Text style={styles.empty}>No bookings found.</Text>}

      <Text style={styles.section}>CLOSED REQUESTS</Text>
      {payments.length ? payments.map((payment) => (
        <View style={styles.card} key={payment.id}>
          <View style={styles.top}>
            <View style={styles.copy}>
              <Text style={styles.title}>{payment.method ?? "ONLINE"} | {payment.invoiceNumber ?? payment.id.slice(0, 8).toUpperCase()}</Text>
              <Text style={styles.detail}>{payment.booking?.salon?.name ?? "Salon"} | Client {payment.booking?.client?.name ?? payment.booking?.client?.phone ?? "N/A"}</Text>
              <Text style={styles.detail}>Owner: {payment.booking?.salon?.owner?.name ?? payment.booking?.salon?.owner?.phone ?? "N/A"}</Text>
              <Text style={styles.detail}>Amount INR {payment.amount} | Brokerage INR {payment.platformFee} | Merchant INR {payment.merchantAmount}</Text>
              {!!payment.cashRemark && <Text style={styles.cashRemark}>Cash remark: {payment.cashRemark}</Text>}
            </View>
            <Text style={styles.resolved}>CLOSED</Text>
          </View>
        </View>
      )) : <Text style={styles.empty}>No closed payment requests yet.</Text>}
    </ScrollView>
  );
}

function serviceNames(booking: AdminBooking) {
  return booking.services?.length ? booking.services.map((item) => item.service.name).join(", ") : booking.service?.name ?? "Salon service";
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    center: { flex: 1, alignItems: "center", justifyContent: "center" },
    page: { padding: 20, paddingBottom: 34 },
    error: { color: colors.danger, fontSize: 11, marginBottom: 10 },
    section: { color: colors.text, fontSize: 12, fontWeight: "700", letterSpacing: 1.5, marginTop: 26, marginBottom: 10 },
    card: { padding: 14, marginBottom: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.panel },
    top: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
    copy: { flex: 1 },
    side: { alignItems: "flex-end", gap: 8 },
    title: { color: colors.text, fontSize: 12, fontWeight: "900", letterSpacing: 1 },
    detail: { color: colors.muted, fontSize: 11, marginTop: 6, lineHeight: 17 },
    cashRemark: { color: colors.green, fontSize: 11, marginTop: 6, lineHeight: 17 },
    status: { color: colors.cyan, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
    open: { color: colors.danger, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
    resolved: { color: colors.green, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
    none: { color: colors.amber, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
    actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
    actionButton: { minHeight: 38, justifyContent: "center", paddingHorizontal: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 8 },
    warnText: { color: colors.amber, fontSize: 10, fontWeight: "900", letterSpacing: 1 },
    goodText: { color: colors.green, fontSize: 10, fontWeight: "900", letterSpacing: 1 },
    dangerText: { color: colors.danger, fontSize: 10, fontWeight: "900", letterSpacing: 1 },
    empty: { color: colors.muted, fontSize: 12, paddingVertical: 8 },
  });
}
