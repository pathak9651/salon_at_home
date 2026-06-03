import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { apiRequest } from "../../api/client";
import { ThemeColors, useTheme } from "../../utils/theme";
import { ScreenHeader } from "../common/ScreenHeader";

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
  commissionRate: number;
  settlementStatus: string;
  razorpayPayment?: string | null;
  booking?: {
    id: string;
    client?: { name?: string | null; phone: string } | null;
    salon?: { name: string; owner?: { name?: string | null; phone: string } };
  };
};

export function AdminPaymentsScreen({ token }: { token: string }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    void loadPayments();
  }, []);

  async function loadPayments() {
    setLoading(true);
    setError("");
    try {
      setPayments(await apiRequest<Payment[]>("/admin/payments", { headers: { Authorization: `Bearer ${token}` } }));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load payments");
    } finally {
      setLoading(false);
    }
  }

  async function updateCommission(paymentId: string, commissionRate: number) {
    setSavingId(paymentId);
    setError("");
    try {
      await apiRequest(`/admin/payments/${paymentId}/commission`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ commissionRate }),
      });
      await loadPayments();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Could not update commission");
    } finally {
      setSavingId(null);
    }
  }

  const totalCollection = payments.reduce((sum, payment) => sum + payment.amount, 0);
  const brokerage = payments.reduce((sum, payment) => sum + payment.platformFee, 0);
  const merchantPayouts = payments.reduce((sum, payment) => sum + payment.merchantAmount, 0);
  const onlineCount = payments.filter((payment) => payment.method === "ONLINE").length;
  const cashCount = payments.filter((payment) => payment.method === "CASH").length;

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.cyan} /></View>;

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <ScreenHeader eyebrow="PLATFORM OPS // PAYMENTS" title="Payment management" subtitle="Track payments, manage commissions, and inspect transaction records." />
      {!!error && <Text style={styles.error}>{error}</Text>}
      <View style={styles.grid}>
        <Metric styles={styles} label="TOTAL COLLECTION" value={`INR ${totalCollection}`} />
        <Metric styles={styles} label="ADMIN COMMISSION" value={`INR ${brokerage}`} />
        <Metric styles={styles} label="MERCHANT PAYOUTS" value={`INR ${merchantPayouts}`} />
        <Metric styles={styles} label="ONLINE PAYMENTS" value={String(onlineCount)} />
        <Metric styles={styles} label="CASH PAYMENTS" value={String(cashCount)} />
        <Metric styles={styles} label="TRANSACTIONS" value={String(payments.length)} />
      </View>

      <Text style={styles.section}>TRANSACTION RECORDS</Text>
      {payments.length ? payments.map((payment) => (
        <View style={styles.card} key={payment.id}>
          <View style={styles.top}>
            <View style={styles.copy}>
              <Text style={styles.title}>{payment.method ?? "PAYMENT"} | {payment.invoiceNumber ?? payment.id.slice(0, 8).toUpperCase()}</Text>
              <Text style={styles.detail}>{payment.booking?.salon?.name ?? "Salon"} | Client {payment.booking?.client?.name ?? payment.booking?.client?.phone ?? "N/A"}</Text>
              <Text style={styles.detail}>Owner: {payment.booking?.salon?.owner?.name ?? payment.booking?.salon?.owner?.phone ?? "N/A"}</Text>
              <Text style={styles.detail}>Paid: {payment.paidAt ? new Date(payment.paidAt).toLocaleString() : payment.status}</Text>
              <Text style={styles.detail}>Settlement: {payment.settlementStatus} | Razorpay: {payment.razorpayPayment ?? "N/A"}</Text>
              {!!payment.cashRemark && <Text style={styles.cashRemark}>Cash remark: {payment.cashRemark}</Text>}
            </View>
            <View style={styles.side}>
              <Text style={styles.amount}>INR {payment.amount}</Text>
              <Text style={styles.method}>{payment.status}</Text>
            </View>
          </View>
          <View style={styles.split}>
            <Text style={styles.splitText}>Commission {payment.commissionRate}%: INR {payment.platformFee}</Text>
            <Text style={styles.splitText}>Merchant: INR {payment.merchantAmount}</Text>
          </View>
          <View style={styles.actions}>
            {[5, 10, 15].map((rate) => (
              <TouchableOpacity disabled={savingId === payment.id || payment.commissionRate === rate} onPress={() => void updateCommission(payment.id, rate)} style={[styles.actionButton, payment.commissionRate === rate && styles.actionActive]} key={rate}>
                <Text style={payment.commissionRate === rate ? styles.actionActiveText : styles.actionText}>{rate}%</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )) : <Text style={styles.empty}>No paid transactions yet.</Text>}
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
    metric: { width: "48%", padding: 15, borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.panelRaised },
    label: { color: colors.cyan, fontSize: 8, letterSpacing: 1, fontWeight: "900" },
    value: { color: colors.text, fontSize: 18, fontWeight: "800", marginTop: 12 },
    section: { color: colors.text, fontSize: 12, fontWeight: "700", letterSpacing: 1.5, marginTop: 26, marginBottom: 10 },
    card: { padding: 14, marginBottom: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.panel },
    top: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
    copy: { flex: 1 },
    side: { alignItems: "flex-end", gap: 8 },
    title: { color: colors.text, fontSize: 12, fontWeight: "900", letterSpacing: 1 },
    detail: { color: colors.muted, fontSize: 11, marginTop: 6, lineHeight: 17 },
    cashRemark: { color: colors.green, fontSize: 11, marginTop: 6, lineHeight: 17 },
    amount: { color: colors.cyan, fontSize: 12, fontWeight: "900" },
    method: { color: colors.amber, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
    split: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border },
    splitText: { color: colors.text, fontSize: 10, fontWeight: "800" },
    actions: { flexDirection: "row", gap: 8, marginTop: 12 },
    actionButton: { minHeight: 36, justifyContent: "center", paddingHorizontal: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 8 },
    actionActive: { borderColor: colors.cyan, backgroundColor: colors.activePanel },
    actionText: { color: colors.cyan, fontSize: 10, fontWeight: "900" },
    actionActiveText: { color: colors.text, fontSize: 10, fontWeight: "900" },
    empty: { color: colors.muted, fontSize: 12, paddingVertical: 8 },
  });
}
