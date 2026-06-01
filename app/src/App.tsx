import * as SecureStore from "expo-secure-store";
import * as NavigationBar from "expo-navigation-bar";
import { StatusBar as ExpoStatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { ActivityIndicator, AppState, Platform, StatusBar, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { apiRequest } from "./api/client";
import { AdminHomeScreen } from "./screens/admin/AdminHomeScreen";
import { AuthScreen } from "./screens/auth/AuthScreen";
import { ClientHomeScreen } from "./screens/client/ClientHomeScreen";
import { OwnerHomeScreen } from "./screens/owner/OwnerHomeScreen";
import { ProfileScreen } from "./screens/profile/ProfileScreen";
import { colors } from "./utils/theme";

export type UserRole = "CLIENT" | "OWNER" | "ADMIN";
export type SessionUser = { id: string; name?: string | null; email?: string | null; phone: string; role: UserRole; profilePhotoUrl?: string | null };
export type AuthSession = { token: string; user: SessionUser };

const TOKEN_KEY = "salon_at_home_token";
type Tab = "home" | "profile";

async function blockSystemBars() {
  StatusBar.setHidden(true, "fade");
  if (Platform.OS === "android") {
    await NavigationBar.setVisibilityAsync("hidden");
  }
}

export default function App() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("home");

  useEffect(() => {
    void restoreSession();
    void blockSystemBars();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void blockSystemBars();
    });
    return () => {
      subscription.remove();
    };
  }, []);

  async function restoreSession() {
    const token = await SecureStore.getItemAsync(TOKEN_KEY);
    if (!token) return setLoading(false);
    try {
      const user = await apiRequest<SessionUser>("/auth/me", { headers: { Authorization: `Bearer ${token}` } });
      setSession({ token, user });
    } catch {
      await SecureStore.deleteItemAsync(TOKEN_KEY);
    } finally {
      setLoading(false);
    }
  }

  async function handleAuthenticated(nextSession: AuthSession) {
    await SecureStore.setItemAsync(TOKEN_KEY, nextSession.token);
    setSession(nextSession);
    setTab("home");
  }

  function handleUserUpdated(user: SessionUser) {
    setSession((current) => current ? { ...current, user: { ...current.user, ...user } } : current);
  }

  async function handleLogout() {
    if (session) {
      await apiRequest("/auth/logout", { method: "POST", headers: { Authorization: `Bearer ${session.token}` } }).catch(() => null);
    }
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    setSession(null);
    setTab("home");
  }

  if (loading) {
    return <View style={styles.loading} onTouchStart={() => void blockSystemBars()}><ExpoStatusBar hidden /><ActivityIndicator color={colors.cyan} /></View>;
  }

  if (!session) {
    return <View style={styles.safe} onTouchStart={() => void blockSystemBars()}><ExpoStatusBar hidden /><AuthScreen onAuthenticated={handleAuthenticated} /></View>;
  }

  return (
    <View style={styles.safe} onTouchStart={() => void blockSystemBars()}>
      <ExpoStatusBar hidden />
      <View style={styles.sessionBar}>
        <Text style={styles.identity}>{session.user.name ?? session.user.email ?? session.user.phone}</Text>
        <Text style={styles.role}>{session.user.role === "OWNER" ? "MERCHANT" : session.user.role}</Text>
      </View>
      <View style={styles.content}>
        {tab === "profile" && <ProfileScreen token={session.token} user={session.user} onLogout={handleLogout} onUserUpdated={handleUserUpdated} />}
        {tab === "home" && session.user.role === "CLIENT" && <ClientHomeScreen />}
        {tab === "home" && session.user.role === "OWNER" && <OwnerHomeScreen />}
        {tab === "home" && session.user.role === "ADMIN" && <AdminHomeScreen />}
      </View>
      <View style={styles.tabs}>
        <TabButton label="HOME" active={tab === "home"} onPress={() => setTab("home")} />
        <TabButton label="PROFILE" active={tab === "profile"} onPress={() => setTab("profile")} />
      </View>
    </View>
  );
}

function TabButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return <TouchableOpacity onPress={onPress} style={styles.tab}><Text style={active ? styles.tabActive : styles.tabInactive}>{label}</Text></TouchableOpacity>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  content: { flex: 1 },
  sessionBar: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: "#07151f" },
  identity: { flex: 1, color: colors.text, fontSize: 11, fontWeight: "700" },
  role: { color: colors.amber, fontSize: 9, fontWeight: "800", letterSpacing: 1 },
  tabs: { flexDirection: "row", borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: "#07151f" },
  tab: { flex: 1, alignItems: "center", paddingVertical: 16 },
  tabActive: { color: colors.cyan, fontSize: 10, fontWeight: "900", letterSpacing: 1.4 },
  tabInactive: { color: colors.muted, fontSize: 10, fontWeight: "800", letterSpacing: 1.4 },
});
