import { StyleSheet, Text, View } from "react-native";
import { colors } from "../../utils/theme";

export function ScreenHeader({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle: string }) {
  return (
    <View style={styles.header}>
      <Text style={styles.eyebrow}>{eyebrow}</Text>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { marginBottom: 18 },
  eyebrow: { color: colors.cyan, fontSize: 9, letterSpacing: 1.8 },
  title: { color: colors.text, fontSize: 28, fontWeight: "700", marginTop: 6 },
  subtitle: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 6 },
});
