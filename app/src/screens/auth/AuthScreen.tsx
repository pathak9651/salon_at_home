import { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { ApiError, apiRequest } from "../../api/client";
import { AuthSession } from "../../App";
import { colors } from "../../utils/theme";

type Mode = "login" | "signup" | "verify" | "forgot" | "reset";
type AccountType = "CLIENT" | "MERCHANT";
type MessageResponse = { message: string; email?: string; devCode?: string };

export function AuthScreen({ onAuthenticated }: { onAuthenticated: (session: AuthSession) => Promise<void> }) {
  const [mode, setMode] = useState<Mode>("login");
  const [accountType, setAccountType] = useState<AccountType>("CLIENT");
  const [name, setName] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);

  function changeMode(nextMode: Mode) {
    setMode(nextMode);
    setError("");
    setNotice("");
    setCode("");
  }

  async function submit() {
    setError("");
    setNotice("");
    setLoading(true);
    try {
      if (mode === "login") {
        await onAuthenticated(await apiRequest<AuthSession>("/auth/login", { method: "POST", body: JSON.stringify({ identifier, password }) }));
      }
      if (mode === "signup") {
        const response = await apiRequest<MessageResponse>("/auth/signup", { method: "POST", body: JSON.stringify({ name, email, phone, password, accountType }) });
        if (response.email) setEmail(response.email);
        changeMode("verify");
        setNotice(response.devCode ? `${response.message} Development code: ${response.devCode}` : response.message);
      }
      if (mode === "verify") {
        await onAuthenticated(await apiRequest<AuthSession>("/auth/verify-account", { method: "POST", body: JSON.stringify({ email, code }) }));
      }
      if (mode === "forgot") {
        const response = await apiRequest<MessageResponse>("/auth/forgot-password", { method: "POST", body: JSON.stringify({ identifier }) });
        if (response.email) setEmail(response.email);
        changeMode("reset");
        setNotice(response.devCode ? `${response.message} Development code: ${response.devCode}` : response.message);
      }
      if (mode === "reset") {
        const response = await apiRequest<MessageResponse>("/auth/reset-password", { method: "POST", body: JSON.stringify({ email, code, password }) });
        changeMode("login");
        setNotice(response.message);
      }
    } catch (submitError) {
      if (submitError instanceof ApiError && submitError.action === "VERIFY_ACCOUNT") {
        if (submitError.email) setEmail(submitError.email);
        changeMode("verify");
        setError(submitError.message);
        return;
      }
      setError(submitError instanceof Error ? submitError.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  }

  async function resendVerification() {
    if (!email) {
      setError("Enter your account email to resend the verification code.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await apiRequest<MessageResponse>("/auth/resend-verification", { method: "POST", body: JSON.stringify({ email }) });
      setNotice(response.devCode ? `${response.message} Development code: ${response.devCode}` : response.message);
    } catch (resendError) {
      setError(resendError instanceof Error ? resendError.message : "Could not resend verification code");
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={0} style={styles.flex}>
      <ScrollView
        contentContainerStyle={styles.page}
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.eyebrow}>SALON AT HOME // SECURE ACCESS</Text>
        <Text style={styles.title}>{titles[mode]}</Text>
        <Text style={styles.subtitle}>{subtitles[mode]}</Text>

        {(mode === "login" || mode === "signup") && <View style={styles.tabs}>
          <Tab label="LOGIN" active={mode === "login"} onPress={() => changeMode("login")} />
          <Tab label="SIGN UP" active={mode === "signup"} onPress={() => changeMode("signup")} />
        </View>}

        {mode === "signup" && <View style={styles.accountTypes}>
          <Tab label="CLIENT" active={accountType === "CLIENT"} onPress={() => setAccountType("CLIENT")} />
          <Tab label="MERCHANT" active={accountType === "MERCHANT"} onPress={() => setAccountType("MERCHANT")} />
        </View>}

        {mode === "signup" && <Field label="FULL NAME" value={name} onChangeText={setName} placeholder="Your name" />}
        {mode === "signup" && <Field label="EMAIL" value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" />}
        {mode === "signup" && <Field label="PHONE" value={phone} onChangeText={setPhone} placeholder="9876543210" keyboardType="phone-pad" />}
        {(mode === "login" || mode === "forgot") && <Field label="EMAIL OR PHONE" value={identifier} onChangeText={setIdentifier} placeholder="Email or phone number" autoCapitalize="none" />}
        {mode === "verify" && <Field label="ACCOUNT EMAIL" value={email} onChangeText={setEmail} placeholder="you@example.com" autoCapitalize="none" keyboardType="email-address" />}
        {mode === "reset" && <Field label="ACCOUNT EMAIL" value={email} onChangeText={setEmail} placeholder="you@example.com" autoCapitalize="none" keyboardType="email-address" />}
        {(mode === "verify" || mode === "reset") && <Field label="6-DIGIT CODE" value={code} onChangeText={setCode} placeholder="123456" keyboardType="number-pad" maxLength={6} />}
        {(mode === "login" || mode === "signup" || mode === "reset") && <Field label={mode === "reset" ? "NEW PASSWORD" : "PASSWORD"} value={password} onChangeText={setPassword} placeholder="Minimum 8 characters, including a number" secureTextEntry />}

        {!!notice && <Text style={styles.notice}>{notice}</Text>}
        {!!error && <Text style={styles.error}>{error}</Text>}
        <TouchableOpacity disabled={loading} onPress={() => void submit()} style={styles.primary}>
          {loading ? <ActivityIndicator color="#00202a" /> : <Text style={styles.primaryText}>{actions[mode]}</Text>}
        </TouchableOpacity>

        {mode === "login" && <TouchableOpacity onPress={() => changeMode("forgot")}><Text style={styles.link}>FORGOT PASSWORD?</Text></TouchableOpacity>}
        {mode === "login" && <TouchableOpacity onPress={() => changeMode("verify")}><Text style={styles.link}>VERIFY ACCOUNT</Text></TouchableOpacity>}
        {mode === "verify" && <TouchableOpacity onPress={() => void resendVerification()}><Text style={styles.link}>RESEND VERIFICATION CODE</Text></TouchableOpacity>}
        {(mode === "verify" || mode === "forgot" || mode === "reset") && <TouchableOpacity onPress={() => changeMode("login")}><Text style={styles.link}>BACK TO LOGIN</Text></TouchableOpacity>}
        <Text style={styles.note}>Verification and password reset codes expire after 10 minutes.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const titles: Record<Mode, string> = { login: "Welcome back.", signup: "Create account.", verify: "Verify email.", forgot: "Recover account.", reset: "Reset password." };
const subtitles: Record<Mode, string> = { login: "Use your email or phone number to continue.", signup: "Choose a client or merchant account.", verify: "Enter the code sent to your email address.", forgot: "Request a password reset code by email.", reset: "Enter your code and choose a new password." };
const actions: Record<Mode, string> = { login: "LOGIN", signup: "CREATE ACCOUNT", verify: "VERIFY ACCOUNT", forgot: "SEND RESET CODE", reset: "RESET PASSWORD" };

function Tab({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return <TouchableOpacity onPress={onPress} style={[styles.tab, active && styles.tabActive]}><Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text></TouchableOpacity>;
}

function Field(props: React.ComponentProps<typeof TextInput> & { label: string }) {
  const { label, ...inputProps } = props;
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput {...inputProps} placeholderTextColor="#54717d" style={styles.input} /></View>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 }, page: { flexGrow: 1, justifyContent: "center", padding: 24 }, eyebrow: { color: colors.cyan, fontSize: 9, letterSpacing: 1.8 }, title: { color: colors.text, fontSize: 32, fontWeight: "800", marginTop: 10 }, subtitle: { color: colors.muted, fontSize: 13, lineHeight: 20, marginTop: 7, marginBottom: 22 }, tabs: { flexDirection: "row", borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel }, accountTypes: { flexDirection: "row", gap: 10, marginTop: 14, marginBottom: 4 }, tab: { flex: 1, alignItems: "center", padding: 13, borderWidth: 1, borderColor: "transparent" }, tabActive: { borderColor: colors.cyan, backgroundColor: "#0c2c38" }, tabText: { color: colors.muted, fontSize: 10, fontWeight: "800", letterSpacing: 1.2 }, tabTextActive: { color: colors.cyan }, field: { marginTop: 15 }, label: { color: colors.amber, fontSize: 9, fontWeight: "800", letterSpacing: 1.2, marginBottom: 7 }, input: { color: colors.text, padding: 13, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel, fontSize: 13 }, notice: { color: colors.green, fontSize: 11, lineHeight: 17, marginTop: 14 }, error: { color: "#ff7b73", fontSize: 11, marginTop: 14 }, primary: { alignItems: "center", justifyContent: "center", minHeight: 44, marginTop: 18, padding: 12, backgroundColor: colors.cyan }, primaryText: { color: "#00202a", fontWeight: "900", fontSize: 10, letterSpacing: 1.2 }, link: { color: colors.cyan, textAlign: "center", fontSize: 10, fontWeight: "800", letterSpacing: 1, marginTop: 17 }, note: { color: colors.muted, textAlign: "center", fontSize: 10, marginTop: 16 },
});
