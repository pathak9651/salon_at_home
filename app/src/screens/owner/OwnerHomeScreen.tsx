import { ScrollView, StyleSheet, Text, View } from "react-native";
import { ScreenHeader } from "../common/ScreenHeader";
import { colors } from "../../utils/theme";

const bookings = [["BK-1098", "Aisha Mehta", "Hair spa", "10:30 AM"], ["BK-1097", "Rahul Verma", "Premium grooming", "11:15 AM"], ["BK-1095", "Karan Shah", "Haircut + beard", "01:45 PM"]];

export function OwnerHomeScreen() {
  return <ScrollView contentContainerStyle={styles.page}><ScreenHeader eyebrow="PARTNER CONSOLE // OWNER" title="Nova Beauty Lab" subtitle="Manage today's operations and earnings." />
    <View style={styles.grid}><Metric label="TODAY'S EARNINGS" value="INR 8,420" /><Metric label="ACTIVE BOOKINGS" value="12" /></View>
    <Text style={styles.section}>BOOKING QUEUE</Text>
    {bookings.map(([id, client, service, time]) => <View style={styles.row} key={id}><View><Text style={styles.id}>{id}</Text><Text style={styles.name}>{client}</Text><Text style={styles.meta}>{service}  |  {time}</Text></View><Text style={styles.pending}>PENDING</Text></View>)}
  </ScrollView>;
}

function Metric({ label, value }: { label: string; value: string }) { return <View style={styles.metric}><Text style={styles.label}>{label}</Text><Text style={styles.value}>{value}</Text></View>; }
const styles = StyleSheet.create({ page: { padding: 20 }, grid: { flexDirection: "row", gap: 10 }, metric: { flex: 1, padding: 15, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panelRaised }, label: { color: colors.cyan, fontSize: 8, letterSpacing: 1 }, value: { color: colors.text, fontSize: 20, fontWeight: "800", marginTop: 12 }, section: { color: colors.text, fontSize: 12, fontWeight: "700", letterSpacing: 1.5, marginTop: 26, marginBottom: 10 }, row: { flexDirection: "row", justifyContent: "space-between", padding: 14, marginBottom: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel }, id: { color: colors.cyan, fontSize: 10, fontWeight: "800" }, name: { color: colors.text, fontSize: 14, fontWeight: "700", marginTop: 7 }, meta: { color: colors.muted, fontSize: 10, marginTop: 5 }, pending: { color: colors.amber, fontSize: 9, fontWeight: "800" } });
