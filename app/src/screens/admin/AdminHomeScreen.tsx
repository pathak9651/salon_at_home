import { ScrollView, StyleSheet, Text, View } from "react-native";
import { ThemeColors, useTheme } from "../../utils/theme";
import { ScreenHeader } from "../common/ScreenHeader";

const activity = [["PAYMENT RECEIVED", "INR 2,999 settled for BK-1096"], ["NEW PARTNER", "Aura Skinworks joined the network"], ["BOOKING ALERT", "BK-1097 waiting for response"]];

export function AdminHomeScreen() {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  return <ScrollView contentContainerStyle={styles.page}><ScreenHeader eyebrow="PLATFORM OPS // ADMIN" title="Command Center" subtitle="Monitor the salon network and payment flow." />
    <View style={styles.grid}><Metric styles={styles} label="REVENUE" value="INR 2.8L" /><Metric styles={styles} label="BOOKINGS" value="148" /><Metric styles={styles} label="SALONS" value="86" /><Metric styles={styles} label="USERS" value="2,846" /></View>
    <Text style={styles.section}>LIVE ACTIVITY</Text>
    {activity.map(([title, detail]) => <View style={styles.row} key={title}><Text style={styles.dot}>+</Text><View><Text style={styles.title}>{title}</Text><Text style={styles.detail}>{detail}</Text></View></View>)}
  </ScrollView>;
}

function Metric({ label, value, styles }: { label: string; value: string; styles: ReturnType<typeof createStyles> }) { return <View style={styles.metric}><Text style={styles.label}>{label}</Text><Text style={styles.value}>{value}</Text></View>; }

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({ page: { padding: 20 }, grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 }, metric: { width: "48%", padding: 15, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panelRaised }, label: { color: colors.cyan, fontSize: 8, letterSpacing: 1 }, value: { color: colors.text, fontSize: 21, fontWeight: "800", marginTop: 12 }, section: { color: colors.text, fontSize: 12, fontWeight: "700", letterSpacing: 1.5, marginTop: 26, marginBottom: 10 }, row: { flexDirection: "row", gap: 11, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel }, dot: { color: colors.green, fontSize: 18 }, title: { color: colors.text, fontSize: 11, fontWeight: "800", letterSpacing: 1 }, detail: { color: colors.muted, fontSize: 11, marginTop: 6 } });
}
