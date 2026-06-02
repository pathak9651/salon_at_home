import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { apiRequest } from "../../api/client";
import { ThemeColors, useTheme } from "../../utils/theme";
import { ScreenHeader } from "../common/ScreenHeader";

type Booking = {
  id: string;
  scheduledAt: string;
  totalAmount: number;
  status: string;
  address: string;
  salon?: { name: string };
  client?: { name?: string | null; phone: string };
  services?: Array<{ service: { name: string }; price: number }>;
  service?: { name: string };
  payment?: Payment | null;
};

type Payment = {
  id: string;
  amount: number;
  status: string;
  method?: "ONLINE" | "CASH" | null;
  platformFee: number;
  merchantAmount: number;
  commissionRate: number;
  invoiceNumber?: string | null;
  paidAt?: string | null;
  cashRemark?: string | null;
  settlementStatus: string;
  booking?: Booking;
};

export function OwnerEarningsScreen({ token }: { token: string }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void loadEarnings();
  }, []);

  async function loadEarnings() {
    setLoading(true);
    setError("");
    try {
      const [nextPayments, nextBookings] = await Promise.all([
        apiRequest<Payment[]>("/payments", { headers: { Authorization: `Bearer ${token}` } }),
        apiRequest<Booking[]>("/bookings", { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      setPayments(nextPayments);
      setBookings(nextBookings);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load earnings");
    } finally {
      setLoading(false);
    }
  }

  const paidPayments = payments.filter((payment) => payment.status === "PAID");
  const completedBookings = bookings.filter((booking) => booking.status === "COMPLETED");
  const totalRevenue = paidPayments.reduce((sum, payment) => sum + payment.amount, 0);
  const totalCommission = paidPayments.reduce((sum, payment) => sum + payment.platformFee, 0);
  const merchantEarnings = paidPayments.reduce((sum, payment) => sum + payment.merchantAmount, 0);
  const onlineTotal = paidPayments.filter((payment) => payment.method === "ONLINE").reduce((sum, payment) => sum + payment.merchantAmount, 0);
  const cashTotal = paidPayments.filter((payment) => payment.method === "CASH").reduce((sum, payment) => sum + payment.merchantAmount, 0);

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.cyan} /></View>;

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <ScreenHeader eyebrow="PARTNER CONSOLE // EARNINGS" title="Earnings" subtitle="Track paid bookings, transactions, merchant earnings, and platform brokerage." />
      {!!error && <Text style={styles.error}>{error}</Text>}

      <View style={styles.grid}>
        <Metric styles={styles} label="MERCHANT EARNINGS" value={`INR ${merchantEarnings}`} />
        <Metric styles={styles} label="TOTAL REVENUE" value={`INR ${totalRevenue}`} />
      </View>
      <View style={styles.grid}>
        <Metric styles={styles} label="ADMIN COMMISSION" value={`INR ${totalCommission}`} />
        <Metric styles={styles} label="COMPLETED BOOKINGS" value={String(completedBookings.length)} />
      </View>
      <View style={styles.grid}>
        <Metric styles={styles} label="ONLINE EARNINGS" value={`INR ${onlineTotal}`} />
        <Metric styles={styles} label="CASH EARNINGS" value={`INR ${cashTotal}`} />
      </View>

      <Text style={styles.section}>TRANSACTION HISTORY</Text>
      {paidPayments.length ? paidPayments.map((payment) => (
        <View style={styles.card} key={payment.id}>
          <View style={styles.row}>
            <View style={styles.copy}>
              <Text style={styles.title}>{payment.invoiceNumber ?? payment.id.slice(0, 8).toUpperCase()}</Text>
              <Text style={styles.meta}>{payment.booking?.salon?.name ?? "Salon"} | {payment.paidAt ? new Date(payment.paidAt).toLocaleString() : payment.status}</Text>
              <Text style={styles.meta}>Closed by: {payment.method ?? "PENDING"} | Settlement: {payment.settlementStatus}</Text>
              {!!payment.cashRemark && <Text style={styles.cashRemark}>Cash remark: {payment.cashRemark}</Text>}
            </View>
            <View style={styles.side}>
              <Text style={styles.amount}>INR {payment.amount}</Text>
              <Text style={styles.method}>{payment.method ?? "PAYMENT"}</Text>
            </View>
          </View>
          <View style={styles.split}>
            <Text style={styles.splitText}>Admin {payment.commissionRate}%: INR {payment.platformFee}</Text>
            <Text style={styles.splitText}>Merchant: INR {payment.merchantAmount}</Text>
          </View>
        </View>
      )) : <Text style={styles.empty}>No paid transactions yet.</Text>}

      <Text style={styles.section}>COMPLETED BOOKINGS</Text>
      {completedBookings.length ? completedBookings.map((booking) => (
        <View style={styles.card} key={booking.id}>
          <View style={styles.row}>
            <View style={styles.copy}>
              <Text style={styles.title}>{serviceNames(booking)}</Text>
              <Text style={styles.meta}>{booking.salon?.name ?? "Salon"} | {new Date(booking.scheduledAt).toLocaleString()}</Text>
              <Text style={styles.meta}>Client: {booking.client?.name ?? booking.client?.phone ?? "N/A"}</Text>
              <Text style={styles.meta}>{booking.address}</Text>
            </View>
            <View style={styles.side}>
              <Text style={styles.amount}>INR {booking.totalAmount}</Text>
              <Text style={booking.payment?.status === "PAID" ? styles.paid : styles.pending}>{booking.payment?.status === "PAID" ? booking.payment.method ?? "PAID" : "WAITING"}</Text>
            </View>
          </View>
        </View>
      )) : <Text style={styles.empty}>No completed bookings yet.</Text>}
    </ScrollView>
  );
}

function serviceNames(booking: Booking) {
  return booking.services?.length ? booking.services.map((item) => item.service.name).join(", ") : booking.service?.name ?? "Salon service";
}

function Metric({ label, value, styles }: { label: string; value: string; styles: ReturnType<typeof createStyles> }) {
  return <View style={styles.metric}><Text style={styles.metricLabel}>{label}</Text><Text style={styles.metricValue}>{value}</Text></View>;
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    center: { flex: 1, alignItems: "center", justifyContent: "center" },
    page: { padding: 20, paddingBottom: 34 },
    grid: { flexDirection: "row", gap: 10, marginBottom: 10 },
    metric: { flex: 1, minHeight: 78, justifyContent: "center", padding: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panelRaised },
    metricLabel: { color: colors.muted, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
    metricValue: { color: colors.text, fontSize: 18, fontWeight: "900", marginTop: 8 },
    section: { color: colors.text, fontSize: 12, fontWeight: "800", letterSpacing: 1.4, marginTop: 18, marginBottom: 10 },
    error: { color: colors.danger, fontSize: 11, marginTop: 14 },
    card: { padding: 14, marginBottom: 9, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel },
    row: { flexDirection: "row", gap: 10 },
    copy: { flex: 1 },
    side: { alignItems: "flex-end" },
    title: { color: colors.text, fontSize: 14, fontWeight: "900" },
    meta: { color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 6 },
    amount: { color: colors.cyan, fontSize: 12, fontWeight: "900" },
    method: { color: colors.amber, fontSize: 9, fontWeight: "900", marginTop: 8 },
    paid: { color: colors.green, fontSize: 9, fontWeight: "900", marginTop: 8 },
    pending: { color: colors.amber, fontSize: 9, fontWeight: "900", marginTop: 8 },
    split: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border },
    splitText: { color: colors.text, fontSize: 10, fontWeight: "800" },
    cashRemark: { color: colors.green, fontSize: 10, lineHeight: 15, marginTop: 6 },
    empty: { color: colors.muted, fontSize: 12, paddingVertical: 8 },
  });
}
