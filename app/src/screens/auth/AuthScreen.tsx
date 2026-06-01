import { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { apiRequest } from "../../api/client";
import { AuthSession } from "../../App";
import { colors } from "../../utils/theme";

type Mode = "login" | "signup";
type AccountType = "CLIENT" | "MERCHANT";

export function AuthScreen({ onAuthenticated }: { onAuthenticated: (session: AuthSession) => Promise<void> }) {
  const [mode, setMode] = useState<Mode>("login");
  const [accountType, setAccountType] = useState<AccountType>("CLIENT");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    setError("");
    setLoading(true);
    try {
      const session = await apiRequest<AuthSession>(`/auth/${mode}`, {
        method: "POST",
        body: JSON.stringify(mode === "login" ? { email, password } : { name, email, phone, password, accountType }),
      });
      await onAuthenticated(session);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <Text style={styles.eyebrow}>SALON AT HOME // ACCESS</Text>
        <Text style={styles.title}>{mode === "login" ? "Welcome back." : "Create account."}</Text>
        <Text style={styles.subtitle}>{mode === "login" ? "Sign in to continue your session." : "Choose how you will use the platform."}</Text>

        <View style={styles.tabs}>
          <Tab label="LOGIN" active={mode === "login"} onPress={() => setMode("login")} />
          <Tab label="SIGN UP" active={mode === "signup"} onPress={() => setMode("signup")} />
        </View>

        {mode === "signup" && <View style={styles.accountTypes}>
          <Tab label="CLIENT" active={accountType === "CLIENT"} onPress={() => setAccountType("CLIENT")} />
          <Tab label="MERCHANT" active={accountType === "MERCHANT"} onPress={() => setAccountType("MERCHANT")} />
        </View>}

        {mode === "signup" && <Field label="FULL NAME" value={name} onChangeText={setName} placeholder="Your name" />}
        <Field label="EMAIL" value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" />
        {mode === "signup" && <Field label="PHONE" value={phone} onChangeText={setPhone} placeholder="9876543210" keyboardType="phone-pad" />}
        <Field label="PASSWORD" value={password} onChangeText={setPassword} placeholder="Minimum 8 characters" secureTextEntry />

        {!!error && <Text style={styles.error}>{error}</Text>}
        <TouchableOpacity disabled={loading} onPress={() => void submit()} style={styles.primary}>
          {loading ? <ActivityIndicator color="#00202a" /> : <Text style={styles.primaryText}>{mode === "login" ? "LOGIN" : `CREATE ${accountType} ACCOUNT`}</Text>}
        </TouchableOpacity>
        <Text style={styles.note}>Admin accounts are provisioned securely by the platform.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Tab({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return <TouchableOpacity onPress={onPress} style={[styles.tab, active && styles.tabActive]}><Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text></TouchableOpacity>;
}

function Field(props: React.ComponentProps<typeof TextInput> & { label: string }) {
  const { label, ...inputProps } = props;
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput {...inputProps} placeholderTextColor="#54717d" style={styles.input} /></View>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 }, page: { flexGrow: 1, justifyContent: "center", padding: 24 }, eyebrow: { color: colors.cyan, fontSize: 9, letterSpacing: 1.8 }, title: { color: colors.text, fontSize: 32, fontWeight: "800", marginTop: 10 }, subtitle: { color: colors.muted, fontSize: 13, lineHeight: 20, marginTop: 7, marginBottom: 22 }, tabs: { flexDirection: "row", borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel }, accountTypes: { flexDirection: "row", gap: 10, marginTop: 14, marginBottom: 4 }, tab: { flex: 1, alignItems: "center", padding: 13, borderWidth: 1, borderColor: "transparent" }, tabActive: { borderColor: colors.cyan, backgroundColor: "#0c2c38" }, tabText: { color: colors.muted, fontSize: 10, fontWeight: "800", letterSpacing: 1.2 }, tabTextActive: { color: colors.cyan }, field: { marginTop: 15 }, label: { color: colors.amber, fontSize: 9, fontWeight: "800", letterSpacing: 1.2, marginBottom: 7 }, input: { color: colors.text, padding: 13, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel, fontSize: 13 }, error: { color: "#ff7b73", fontSize: 11, marginTop: 14 }, primary: { alignItems: "center", justifyContent: "center", minHeight: 44, marginTop: 18, padding: 12, backgroundColor: colors.cyan }, primaryText: { color: "#00202a", fontWeight: "900", fontSize: 10, letterSpacing: 1.2 }, note: { color: colors.muted, textAlign: "center", fontSize: 10, marginTop: 16 },
});
