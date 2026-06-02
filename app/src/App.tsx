import * as SecureStore from "expo-secure-store";
import { StatusBar as ExpoStatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { ActivityIndicator, Platform, SafeAreaView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { apiRequest } from "./api/client";
import { AdminHomeScreen } from "./screens/admin/AdminHomeScreen";
import { AuthScreen } from "./screens/auth/AuthScreen";
import { MyBookingsScreen } from "./screens/bookings/MyBookingsScreen";
import { ClientHomeScreen } from "./screens/client/ClientHomeScreen";
import { OwnerHomeScreen } from "./screens/owner/OwnerHomeScreen";
import { ProfileScreen } from "./screens/profile/ProfileScreen";
import { palettes, ThemeMode, ThemeProvider, useTheme } from "./utils/theme";

export type UserRole = "CLIENT" | "OWNER" | "ADMIN";
export type SessionUser = { id: string; name?: string | null; email?: string | null; phone: string; role: UserRole; profilePhotoUrl?: string | null };
export type AuthSession = { token: string; user: SessionUser };

const TOKEN_KEY = "salon_at_home_token";
type Tab = "home" | "bookings" | "profile";

export default function App() {
  const [themeMode, setThemeMode] = useState<ThemeMode>("dark");
  const themeValue = {
    colors: palettes[themeMode],
    mode: themeMode,
    toggleTheme: () => setThemeMode((current) => current === "dark" ? "light" : "dark"),
  };

  return (
    <ThemeProvider value={themeValue}>
      <AppContent />
    </ThemeProvider>
  );
}

function AppContent() {
  const { colors, mode, toggleTheme } = useTheme();
  const styles = createStyles(colors);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("home");

  useEffect(() => {
    void restoreSession();
  }, []);

  useEffect(() => {
    StatusBar.setHidden(false, "fade");
    StatusBar.setTranslucent(false);
    StatusBar.setBackgroundColor(colors.bar, true);
    StatusBar.setBarStyle(mode === "dark" ? "light-content" : "dark-content", true);
  }, [colors.bar, mode]);

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
    return <SafeAreaView style={styles.loading}><ExpoStatusBar hidden={false} style={mode === "dark" ? "light" : "dark"} backgroundColor={colors.bar} /><ActivityIndicator color={colors.cyan} /></SafeAreaView>;
  }

  if (!session) {
    return <SafeAreaView style={styles.safe}><ExpoStatusBar hidden={false} style={mode === "dark" ? "light" : "dark"} backgroundColor={colors.bar} /><AuthScreen onAuthenticated={handleAuthenticated} /></SafeAreaView>;
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ExpoStatusBar hidden={false} style={mode === "dark" ? "light" : "dark"} backgroundColor={colors.bar} />
      <View style={styles.sessionBar}>
        <Text style={styles.identity}>{session.user.name ?? session.user.email ?? session.user.phone}</Text>
        <Text style={styles.role}>{session.user.role === "OWNER" ? "MERCHANT" : session.user.role}</Text>
        <TouchableOpacity onPress={toggleTheme} style={styles.themeButton}>
          <Text style={styles.themeButtonText}>{mode === "dark" ? "LIGHT" : "DARK"}</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.content}>
        {tab === "profile" && <ProfileScreen token={session.token} user={session.user} onLogout={handleLogout} onUserUpdated={handleUserUpdated} />}
        {tab === "bookings" && <MyBookingsScreen token={session.token} />}
        {tab === "home" && session.user.role === "CLIENT" && <ClientHomeScreen token={session.token} onBookingCompleted={() => setTab("bookings")} />}
        {tab === "home" && session.user.role === "OWNER" && <OwnerHomeScreen token={session.token} />}
        {tab === "home" && session.user.role === "ADMIN" && <AdminHomeScreen token={session.token} />}
      </View>
      <View style={styles.tabs}>
        <TabButton label="HOME" active={tab === "home"} onPress={() => setTab("home")} />
        <TabButton label="MY BOOKINGS" active={tab === "bookings"} onPress={() => setTab("bookings")} />
        <TabButton label="PROFILE" active={tab === "profile"} onPress={() => setTab("profile")} />
      </View>
    </SafeAreaView>
  );
}

function TabButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  return <TouchableOpacity onPress={onPress} style={styles.tab}><Text style={active ? styles.tabActive : styles.tabInactive}>{label}</Text></TouchableOpacity>;
}

function createStyles(colors: typeof palettes.dark) {
  const topInset = Platform.OS === "android" ? StatusBar.currentHeight ?? 0 : 0;
  return StyleSheet.create({
  safe: { flex: 1, paddingTop: topInset, backgroundColor: colors.background },
  loading: { flex: 1, paddingTop: topInset, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  content: { flex: 1 },
  sessionBar: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.bar },
  identity: { flex: 1, color: colors.text, fontSize: 11, fontWeight: "700" },
  role: { color: colors.amber, fontSize: 9, fontWeight: "800", letterSpacing: 1 },
  themeButton: { paddingHorizontal: 10, paddingVertical: 7, borderWidth: 1, borderColor: colors.cyan },
  themeButtonText: { color: colors.cyan, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  tabs: { flexDirection: "row", borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.bar },
  tab: { flex: 1, alignItems: "center", paddingVertical: 16 },
  tabActive: { color: colors.cyan, fontSize: 10, fontWeight: "900", letterSpacing: 1.4 },
  tabInactive: { color: colors.muted, fontSize: 10, fontWeight: "800", letterSpacing: 1.4 },
  });
}
