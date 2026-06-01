import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { ScreenHeader } from "../common/ScreenHeader";
import { colors } from "../../utils/theme";

const services = [["CUT", "Haircut", "From INR 499"], ["SPA", "Hair spa", "From INR 999"], ["SKN", "Skin care", "From INR 799"], ["BRD", "Grooming", "From INR 399"]];
const salons = [["Nova Beauty Lab", "4.9", "1.2 km"], ["The Grooming Grid", "4.8", "2.0 km"], ["Glow Protocol", "4.7", "2.4 km"]];

export function ClientHomeScreen() {
  return (
    <ScrollView contentContainerStyle={styles.page}>
      <ScreenHeader eyebrow="SALON AT HOME // CLIENT" title="Hello, Aisha" subtitle="Book verified salon professionals near you." />
      <View style={styles.location}><Text style={styles.online}>ONLINE</Text><Text style={styles.locationText}>Indiranagar, Bengaluru</Text></View>
      <View style={styles.hero}><Text style={styles.heroTag}>BEAUTY, ON DEMAND</Text><Text style={styles.heroTitle}>Your next self-care session is close.</Text><TouchableOpacity style={styles.primary}><Text style={styles.primaryText}>EXPLORE NEARBY</Text></TouchableOpacity></View>
      <Text style={styles.section}>SERVICES</Text>
      <View style={styles.grid}>{services.map(([code, name, price]) => <View style={styles.service} key={code}><Text style={styles.code}>{code}</Text><Text style={styles.name}>{name}</Text><Text style={styles.meta}>{price}</Text></View>)}</View>
      <Text style={styles.section}>NEARBY SALONS</Text>
      {salons.map(([name, rating, distance]) => <View style={styles.salon} key={name}><View><Text style={styles.name}>{name}</Text><Text style={styles.rating}>RATING {rating}  |  {distance}</Text></View><Text style={styles.arrow}>-&gt;</Text></View>)}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 20, paddingBottom: 28 }, location: { flexDirection: "row", justifyContent: "space-between", padding: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel }, online: { color: colors.green, fontSize: 9, fontWeight: "800", letterSpacing: 1 }, locationText: { color: colors.text, fontSize: 12 }, hero: { marginTop: 14, padding: 18, borderWidth: 1, borderColor: "#205063", backgroundColor: colors.panelRaised }, heroTag: { color: colors.amber, fontSize: 9, letterSpacing: 1.8 }, heroTitle: { color: colors.text, fontSize: 26, lineHeight: 32, fontWeight: "700", marginVertical: 14 }, primary: { alignSelf: "flex-start", backgroundColor: colors.cyan, padding: 11 }, primaryText: { color: "#00202a", fontSize: 10, fontWeight: "800", letterSpacing: 1 }, section: { color: colors.text, fontWeight: "700", fontSize: 12, letterSpacing: 1.5, marginTop: 24, marginBottom: 10 }, grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 }, service: { width: "48%", padding: 13, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel }, code: { color: colors.cyan, fontWeight: "800", fontSize: 9, letterSpacing: 1.4 }, name: { color: colors.text, fontWeight: "700", fontSize: 14, marginTop: 8 }, meta: { color: colors.muted, fontSize: 10, marginTop: 5 }, salon: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 14, marginBottom: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel }, rating: { color: colors.amber, fontSize: 10, marginTop: 6 }, arrow: { color: colors.cyan, fontSize: 18 },
});
