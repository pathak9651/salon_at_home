import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SessionUser } from "../../App";
import { colors } from "../../utils/theme";

export function ProfileScreen({ user, onLogout }: { user: SessionUser; onLogout: () => Promise<void> }) {
  const displayRole = user.role === "OWNER" ? "MERCHANT" : user.role;
  const initials = (user.name ?? user.email ?? "SA").split(/[\s@]+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Text style={styles.eyebrow}>ACCOUNT // PROFILE</Text>
      <View style={styles.hero}>
        <View style={styles.avatar}><Text style={styles.initials}>{initials}</Text></View>
        <View style={styles.heroCopy}>
          <Text style={styles.name}>{user.name ?? "Salon At Home User"}</Text>
          <Text style={styles.role}>{displayRole} ACCOUNT</Text>
          <Text style={styles.status}>● VERIFIED SESSION</Text>
        </View>
      </View>

      <Text style={styles.section}>PERSONAL INFORMATION</Text>
      <ProfileRow label="FULL NAME" value={user.name ?? "Not added"} />
      <ProfileRow label="EMAIL ADDRESS" value={user.email ?? "Not added"} />
      <ProfileRow label="PHONE NUMBER" value={user.phone} />
      <ProfileRow label="ACCOUNT TYPE" value={displayRole} highlight />

      <Text style={styles.section}>SECURITY</Text>
      <View style={styles.security}>
        <Text style={styles.securityTitle}>PASSWORD PROTECTED</Text>
        <Text style={styles.securityText}>Your active session is stored securely on this device. Logging out invalidates its access token immediately.</Text>
      </View>

      <TouchableOpacity onPress={() => void onLogout()} style={styles.logout}>
        <Text style={styles.logoutText}>LOGOUT FROM DEVICE</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function ProfileRow({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return <View style={styles.row}><Text style={styles.label}>{label}</Text><Text style={highlight ? styles.highlight : styles.value}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  page: { padding: 20, paddingBottom: 30 }, eyebrow: { color: colors.cyan, fontSize: 9, letterSpacing: 1.8, marginBottom: 14 }, hero: { flexDirection: "row", alignItems: "center", padding: 17, borderWidth: 1, borderColor: "#205063", backgroundColor: colors.panelRaised }, avatar: { width: 64, height: 64, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.cyan, backgroundColor: "#103746" }, initials: { color: colors.cyan, fontSize: 21, fontWeight: "900", letterSpacing: 1 }, heroCopy: { marginLeft: 15, flex: 1 }, name: { color: colors.text, fontSize: 20, fontWeight: "800" }, role: { color: colors.amber, fontSize: 9, fontWeight: "900", letterSpacing: 1.4, marginTop: 7 }, status: { color: colors.green, fontSize: 9, fontWeight: "800", letterSpacing: 1, marginTop: 8 }, section: { color: colors.text, fontSize: 12, fontWeight: "800", letterSpacing: 1.4, marginTop: 25, marginBottom: 10 }, row: { padding: 14, marginBottom: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel }, label: { color: colors.muted, fontSize: 9, fontWeight: "800", letterSpacing: 1 }, value: { color: colors.text, fontSize: 13, fontWeight: "700", marginTop: 7 }, highlight: { color: colors.cyan, fontSize: 13, fontWeight: "800", marginTop: 7 }, security: { padding: 14, borderWidth: 1, borderColor: "#594320", backgroundColor: "#211b12" }, securityTitle: { color: colors.amber, fontSize: 10, fontWeight: "900", letterSpacing: 1.1 }, securityText: { color: "#b5a785", fontSize: 11, lineHeight: 18, marginTop: 8 }, logout: { alignItems: "center", marginTop: 21, padding: 14, borderWidth: 1, borderColor: "#7c3535", backgroundColor: "#241719" }, logoutText: { color: "#ff8d86", fontSize: 10, fontWeight: "900", letterSpacing: 1.2 },
});
