import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { apiRequest } from "../../api/client";
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

type Payment = {
  id: string;
  amount: number;
  status: string;
  method?: string | null;
  invoiceNumber?: string | null;
  cashRemark?: string | null;
  paidAt?: string | null;
  platformFee: number;
  merchantAmount: number;
  booking?: {
    id: string;
    client?: { name?: string | null; phone: string } | null;
    salon?: { name: string; owner?: { name?: string | null; phone: string } };
  };
};

export function AdminHomeScreen({ token }: { token: string }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void loadOverview();
  }, []);

  async function loadOverview() {
    setLoading(true);
    setError("");
    try {
      setOverview(await apiRequest<Overview>("/admin/overview", { headers: { Authorization: `Bearer ${token}` } }));
      setPayments(await apiRequest<Payment[]>("/admin/payments", { headers: { Authorization: `Bearer ${token}` } }));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load admin overview");
    } finally {
      setLoading(false);
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
      <Text style={styles.section}>CLOSED REQUESTS</Text>
      {payments.length ? payments.map((payment) => (
        <View style={styles.row} key={payment.id}>
          <Text style={styles.dot}>+</Text>
          <View style={styles.copy}>
            <Text style={styles.title}>{payment.method ?? "ONLINE"} | {payment.invoiceNumber ?? payment.id.slice(0, 8).toUpperCase()}</Text>
            <Text style={styles.detail}>{payment.booking?.salon?.name ?? "Salon"} | Client {payment.booking?.client?.name ?? payment.booking?.client?.phone ?? "N/A"}</Text>
            <Text style={styles.detail}>Amount INR {payment.amount} | Brokerage INR {payment.platformFee} | Merchant INR {payment.merchantAmount}</Text>
            {payment.cashRemark ? <Text style={styles.cashRemark}>Cash remark: {payment.cashRemark}</Text> : null}
          </View>
        </View>
      )) : <Text style={styles.empty}>No closed payment requests yet.</Text>}
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
    empty: { color: colors.muted, fontSize: 12, paddingVertical: 8 },
  });
}
