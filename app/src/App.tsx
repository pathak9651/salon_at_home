import { Ionicons } from "@expo/vector-icons";
import * as SecureStore from "expo-secure-store";
import { StatusBar as ExpoStatusBar } from "expo-status-bar";
import { ComponentProps, useEffect, useState } from "react";
import { ActivityIndicator, Platform, SafeAreaView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { apiRequest } from "./api/client";
import { AdminHomeScreen } from "./screens/admin/AdminHomeScreen";
import { AuthScreen } from "./screens/auth/AuthScreen";
import { MyBookingsScreen } from "./screens/bookings/MyBookingsScreen";
import { ClientHomeScreen } from "./screens/client/ClientHomeScreen";
import { NotificationsScreen } from "./screens/notifications/NotificationsScreen";
import { OwnerHomeScreen } from "./screens/owner/OwnerHomeScreen";
import { ProfileScreen } from "./screens/profile/ProfileScreen";
import { palettes, ThemeMode, ThemeProvider, useTheme } from "./utils/theme";

export type UserRole = "CLIENT" | "OWNER" | "ADMIN";
export type SessionUser = { id: string; name?: string | null; email?: string | null; phone: string; role: UserRole; profilePhotoUrl?: string | null };
export type AuthSession = { token: string; user: SessionUser };

const TOKEN_KEY = "salon_at_home_token";
type Tab = "home" | "bookings" | "notifications" | "profile";

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
  const [unreadNotifications, setUnreadNotifications] = useState(0);

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
      await refreshUnreadCount(token);
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
    await refreshUnreadCount(nextSession.token);
  }

  async function refreshUnreadCount(token = session?.token) {
    if (!token) return;
    const response = await apiRequest<{ unreadCount: number }>("/notifications", { headers: { Authorization: `Bearer ${token}` } }).catch(() => null);
    setUnreadNotifications(response?.unreadCount ?? 0);
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
    setUnreadNotifications(0);
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
        <TouchableOpacity onPress={() => setTab("notifications")} style={styles.noticeButton}>
          <Text style={styles.noticeIcon}>🔔</Text>
          {!!unreadNotifications && <View style={styles.noticeBadge}><Text style={styles.noticeBadgeText}>{unreadNotifications > 9 ? "9+" : unreadNotifications}</Text></View>}
        </TouchableOpacity>
        <TouchableOpacity onPress={toggleTheme} style={styles.themeButton}>
          <Text style={styles.themeButtonText}>{mode === "dark" ? "LIGHT" : "DARK"}</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.content}>
        {tab === "profile" && <ProfileScreen token={session.token} user={session.user} onLogout={handleLogout} onUserUpdated={handleUserUpdated} />}
        {tab === "bookings" && <MyBookingsScreen token={session.token} />}
        {tab === "notifications" && <NotificationsScreen token={session.token} onUnreadChanged={setUnreadNotifications} />}
        {tab === "home" && session.user.role === "CLIENT" && <ClientHomeScreen token={session.token} onBookingCompleted={() => { void refreshUnreadCount(); setTab("bookings"); }} />}
        {tab === "home" && session.user.role === "OWNER" && <OwnerHomeScreen token={session.token} />}
        {tab === "home" && session.user.role === "ADMIN" && <AdminHomeScreen token={session.token} />}
      </View>
      <View style={styles.tabs}>
        <TabButton icon="home" inactiveIcon="home-outline" label="Home" active={tab === "home"} onPress={() => setTab("home")} />
        <TabButton icon="calendar" inactiveIcon="calendar-outline" label="My bookings" active={tab === "bookings"} onPress={() => setTab("bookings")} />
        <TabButton icon="person" inactiveIcon="person-outline" label="Profile" active={tab === "profile"} onPress={() => setTab("profile")} />
      </View>
    </SafeAreaView>
  );
}

function TabButton({
  icon,
  inactiveIcon,
  label,
  active,
  onPress,
}: {
  icon: ComponentProps<typeof Ionicons>["name"];
  inactiveIcon: ComponentProps<typeof Ionicons>["name"];
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  return (
    <TouchableOpacity accessibilityLabel={label} accessibilityRole="button" onPress={onPress} style={[styles.tab, active && styles.tabSelected]}>
      <Ionicons name={active ? icon : inactiveIcon} size={24} color={active ? colors.cyan : colors.muted} />
    </TouchableOpacity>
  );
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
  noticeButton: { width: 34, height: 34, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.cyan },
  noticeIcon: { fontSize: 17 },
  noticeBadge: { position: "absolute", top: -7, right: -7, minWidth: 18, height: 18, alignItems: "center", justifyContent: "center", paddingHorizontal: 4, borderWidth: 1, borderColor: colors.bar, backgroundColor: colors.danger },
  noticeBadgeText: { color: colors.buttonText, fontSize: 8, fontWeight: "900" },
  themeButton: { paddingHorizontal: 10, paddingVertical: 7, borderWidth: 1, borderColor: colors.cyan },
  themeButtonText: { color: colors.cyan, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  tabs: { flexDirection: "row", borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.bar },
  tab: { flex: 1, alignItems: "center", justifyContent: "center", minHeight: 56, paddingVertical: 12 },
  tabSelected: { backgroundColor: colors.activePanel },
  });
}
