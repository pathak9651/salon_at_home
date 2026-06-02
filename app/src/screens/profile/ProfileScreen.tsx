import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Image, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SessionUser } from "../../App";
import { API_URL, apiAssetUrl, apiRequest } from "../../api/client";
import { ThemeColors, useTheme } from "../../utils/theme";
import { KeyboardAwareScreen } from "../common/KeyboardAwareScreen";

type Address = {
  id: string;
  label: string;
  line1: string;
  line2?: string | null;
  city: string;
  state: string;
  pincode: string;
  isDefault: boolean;
};

type Profile = SessionUser & {
  emailVerified: boolean;
  addresses: Address[];
};

const emptyAddress = { label: "", line1: "", line2: "", city: "", state: "", pincode: "", isDefault: false };

function normalizeAddress(address: typeof emptyAddress) {
  return {
    label: address.label.trim(),
    line1: address.line1.trim(),
    line2: address.line2.trim(),
    city: address.city.trim(),
    state: address.state.trim(),
    pincode: address.pincode.trim(),
    isDefault: address.isDefault,
  };
}

export function ProfileScreen({
  token,
  user,
  onLogout,
  onUserUpdated,
  onOpenBookings,
  onOpenNotifications,
}: {
  token: string;
  user: SessionUser;
  onLogout: () => Promise<void>;
  onUserUpdated: (user: SessionUser) => void;
  onOpenBookings?: () => void;
  onOpenNotifications?: () => void;
}) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [name, setName] = useState(user.name ?? "");
  const [phone, setPhone] = useState(user.phone);
  const [address, setAddress] = useState(emptyAddress);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [detectingLocation, setDetectingLocation] = useState(false);
  const [activeSection, setActiveSection] = useState<"profile" | "address" | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void loadProfile();
  }, []);

  async function loadProfile() {
    setLoading(true);
    setError("");
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const nextProfile = await apiRequest<Profile>("/profile", { headers });
      setProfile(nextProfile);
      setName(nextProfile.name ?? "");
      setPhone(nextProfile.phone);
      onUserUpdated(nextProfile);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load profile");
    } finally {
      setLoading(false);
    }
  }

  async function savePersonalInfo() {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const nextProfile = await apiRequest<Profile>("/profile", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name, phone }),
      });
      setProfile(nextProfile);
      onUserUpdated(nextProfile);
      setNotice("Profile updated");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not update profile");
    } finally {
      setSaving(false);
    }
  }

  async function uploadPhoto() {
    setError("");
    setNotice("");
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError("Allow photo access to upload a profile picture.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: true,
      aspect: [1, 1],
      mediaTypes: ["images"],
      quality: 0.82,
    });
    if (result.canceled) return;

    setSaving(true);
    try {
      const asset = result.assets[0];
      const image = await fetch(asset.uri);
      const body = await image.blob();
      const nextProfile = await fetch(`${API_URL}/profile/photo`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": asset.mimeType ?? "image/jpeg",
        },
        body,
      }).then(async (response) => {
        if (!response.ok) {
          const payload = await response.json().catch(() => null) as { error?: string } | null;
          throw new Error(payload?.error ?? "Could not upload profile photo");
        }
        return response.json() as Promise<Profile>;
      });
      setProfile(nextProfile);
      onUserUpdated(nextProfile);
      setNotice("Profile photo updated");
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Could not upload profile photo");
    } finally {
      setSaving(false);
    }
  }

  async function addAddress() {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const nextAddress = normalizeAddress(address);
      if (!nextAddress.label || !nextAddress.line1 || !nextAddress.city || !nextAddress.state || !nextAddress.pincode) {
        throw new Error("Fill label, address line 1, city, state, and pincode before saving.");
      }
      const savedAddress = await apiRequest<Address>("/profile/addresses", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify(nextAddress),
      });
      setAddress(emptyAddress);
      setProfile((current) => current ? {
        ...current,
        addresses: savedAddress.isDefault
          ? [savedAddress, ...current.addresses.map((item) => ({ ...item, isDefault: false }))]
          : [savedAddress, ...current.addresses],
      } : current);
      setNotice("Address saved");
    } catch (addressError) {
      setError(addressError instanceof Error ? addressError.message : "Could not save address");
    } finally {
      setSaving(false);
    }
  }

  async function detectAddress() {
    setDetectingLocation(true);
    setError("");
    setNotice("");
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setError("Allow location access to auto-detect your address.");
        return;
      }

      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const [place] = await Location.reverseGeocodeAsync(position.coords);
      if (!place) throw new Error("Could not detect an address from your location");

      const streetParts = [place.name, place.street].filter(Boolean);
      const line1 = streetParts.length ? streetParts.join(", ") : [place.district, place.subregion].filter(Boolean).join(", ");
      const line2 = [place.district, place.subregion].filter(Boolean).join(", ");
      setAddress((current) => ({
        ...current,
        label: current.label || "Current Location",
        line1: line1 || current.line1,
        line2: line2 || current.line2,
        city: place.city || current.city,
        state: place.region || current.state,
        pincode: place.postalCode || current.pincode,
      }));
      setNotice("Location detected. Review the address before saving.");
    } catch (locationError) {
      setError(locationError instanceof Error ? locationError.message : "Could not detect location");
    } finally {
      setDetectingLocation(false);
    }
  }

  async function makeDefaultAddress(id: string) {
    await apiRequest<Address>(`/profile/addresses/${id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ isDefault: true }),
    });
    await loadProfile();
  }

  async function deleteAddress(id: string) {
    await apiRequest<void>(`/profile/addresses/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    await loadProfile();
  }

  const displayRole = user.role === "OWNER" ? "MERCHANT" : user.role;
  const photoUrl = apiAssetUrl(profile?.profilePhotoUrl ?? user.profilePhotoUrl);
  const initials = (profile?.name ?? user.name ?? user.email ?? "SA").split(/[\s@]+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
  const displayName = profile?.name ?? user.name ?? "My Profile";
  const displayPhone = profile?.phone ?? user.phone;

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={colors.cyan} /></View>;
  }

  return (
    <KeyboardAwareScreen contentContainerStyle={styles.page}>
        <View style={styles.topBar}>
          <Text style={styles.screenTitle}>My Profile</Text>
          <View style={styles.topActions}>
            <TouchableOpacity accessibilityLabel="Notifications" onPress={onOpenNotifications} style={styles.iconButton}>
              <Ionicons name="notifications-outline" size={22} color={colors.text} />
            </TouchableOpacity>
            <TouchableOpacity accessibilityLabel="Profile settings" onPress={() => setActiveSection("profile")} style={styles.iconButton}>
              <Ionicons name="settings-outline" size={22} color={colors.text} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.identityBlock}>
          <TouchableOpacity accessibilityLabel="Save profile photo" onPress={() => void uploadPhoto()} style={styles.avatar}>
            {photoUrl ? <Image source={{ uri: photoUrl }} style={styles.avatarImage} /> : <Text style={styles.initials}>{initials}</Text>}
            <View style={styles.editBadge}><Ionicons name="pencil" size={15} color={colors.buttonText} /></View>
          </TouchableOpacity>
          <View style={styles.identityCopy}>
            <Text style={styles.name}>{displayName}</Text>
            <View style={styles.phoneLine}>
              <Ionicons name="call" size={15} color={colors.muted} />
              <Text style={styles.phone}>{displayPhone}</Text>
            </View>
            <Text style={styles.role}>{displayRole} ACCOUNT</Text>
          </View>
        </View>

        {!!notice && <Text style={styles.notice}>{notice}</Text>}
        {!!error && <Text style={styles.error}>{error}</Text>}

        <View style={styles.quickGrid}>
          <QuickTile icon="calendar-number-outline" title="My bookings" onPress={onOpenBookings} />
          <QuickTile icon="gift-outline" title="Refer And Earn" onPress={() => Alert.alert("Refer And Earn", "Referral rewards will be available soon.")} />
          <QuickTile icon="headset-outline" title="Help & support" onPress={() => Alert.alert("Help & support", "Raise a ticket from the profile menu for support.")} />
        </View>

        <View style={styles.menu}>
          <MenuRow icon="person-circle-outline" title="My Profile" onPress={() => setActiveSection(activeSection === "profile" ? null : "profile")} active={activeSection === "profile"} />
          {activeSection === "profile" && (
            <View style={styles.inlinePanel}>
              <Field label="FULL NAME" value={name} onChangeText={setName} placeholder="Your name" />
              <ProfileRow label="EMAIL ADDRESS" value={profile?.email ?? "Not added"} />
              <Field label="PHONE NUMBER" value={phone} onChangeText={setPhone} placeholder="9876543210" keyboardType="phone-pad" />
              <ProfileRow label="ACCOUNT TYPE" value={displayRole} highlight />
              <TouchableOpacity disabled={saving} onPress={() => void savePersonalInfo()} style={styles.primary}>
                {saving ? <ActivityIndicator color={colors.buttonText} /> : <Text style={styles.primaryText}>SAVE</Text>}
              </TouchableOpacity>
            </View>
          )}

          <MenuRow icon="diamond-outline" title="My Membership Plan" onPress={() => Alert.alert("Membership Plan", "Membership plans will be available soon.")} />
          <MenuRow icon="location-outline" title="Manage Address" onPress={() => setActiveSection(activeSection === "address" ? null : "address")} active={activeSection === "address"} />
          {activeSection === "address" && (
            <View style={styles.inlinePanel}>
              {profile?.addresses.length ? profile.addresses.map((item) => (
                <View style={styles.addressCard} key={item.id}>
                  <View style={styles.addressHeader}>
                    <Text style={styles.addressLabel}>{item.label}</Text>
                    {item.isDefault && <Text style={styles.defaultBadge}>DEFAULT</Text>}
                  </View>
                  <Text style={styles.addressText}>{[item.line1, item.line2, item.city, item.state, item.pincode].filter(Boolean).join(", ")}</Text>
                  <View style={styles.rowActions}>
                    {!item.isDefault && <TouchableOpacity onPress={() => void makeDefaultAddress(item.id)}><Text style={styles.link}>MAKE DEFAULT</Text></TouchableOpacity>}
                    <TouchableOpacity onPress={() => Alert.alert("Delete address?", "This saved address will be removed.", [{ text: "Cancel" }, { text: "Delete", onPress: () => void deleteAddress(item.id), style: "destructive" }])}><Text style={styles.deleteLink}>DELETE</Text></TouchableOpacity>
                  </View>
                </View>
              )) : <Text style={styles.empty}>No saved addresses yet.</Text>}

              <View style={styles.addressForm}>
                <TouchableOpacity accessibilityLabel="Auto detect location" accessibilityRole="button" disabled={detectingLocation} onPress={() => void detectAddress()} style={styles.locationButton}>
                  {detectingLocation ? <ActivityIndicator color={colors.cyan} /> : <Ionicons name="locate" size={22} color={colors.cyan} />}
                </TouchableOpacity>
                <Field label="LABEL" value={address.label} onChangeText={(label) => setAddress((current) => ({ ...current, label }))} placeholder="Home, Work, Studio" />
                <Field label="ADDRESS LINE 1" value={address.line1} onChangeText={(line1) => setAddress((current) => ({ ...current, line1 }))} placeholder="House number and street" />
                <Field label="ADDRESS LINE 2" value={address.line2} onChangeText={(line2) => setAddress((current) => ({ ...current, line2 }))} placeholder="Landmark or area" />
                <Field label="CITY" value={address.city} onChangeText={(city) => setAddress((current) => ({ ...current, city }))} placeholder="City" />
                <Field label="PINCODE" value={address.pincode} onChangeText={(pincode) => setAddress((current) => ({ ...current, pincode }))} placeholder="560001" keyboardType="number-pad" />
                <Field label="STATE" value={address.state} onChangeText={(state) => setAddress((current) => ({ ...current, state }))} placeholder="State" />
                <TouchableOpacity onPress={() => setAddress((current) => ({ ...current, isDefault: !current.isDefault }))} style={styles.checkbox}>
                  <View style={[styles.checkboxBox, address.isDefault && styles.checkboxActive]} />
                  <Text style={styles.checkboxText}>Set as default address</Text>
                </TouchableOpacity>
                <TouchableOpacity disabled={saving} onPress={() => void addAddress()} style={styles.primary}><Text style={styles.primaryText}>SAVE</Text></TouchableOpacity>
              </View>
            </View>
          )}
          <MenuRow icon="information-circle-outline" title="About App" onPress={() => Alert.alert("About App", "Salon At Home connects clients with trusted salon services at home.")} />
          <MenuRow icon="shield-checkmark-outline" title="Privacy Policy" onPress={() => Alert.alert("Privacy Policy", "Privacy policy content will be added in the app settings.")} />
          <MenuRow icon="document-text-outline" title="Terms & Conditions" onPress={() => Alert.alert("Terms & Conditions", "Terms and conditions content will be added in the app settings.")} />
          <MenuRow icon="warning-outline" title="Report A Safety Issue" onPress={() => Alert.alert("Report A Safety Issue", "Please contact support immediately for urgent safety issues.")} />
          <MenuRow icon="ticket-outline" title="Raise a ticket" onPress={() => Alert.alert("Raise a ticket", "Support ticket creation will be available soon.")} />
          <MenuRow icon="log-out-outline" title="Logout" destructive onPress={() => void onLogout()} />
        </View>
    </KeyboardAwareScreen>
  );
}

function Field(props: React.ComponentProps<typeof TextInput> & { label: string }) {
  const { label, ...inputProps } = props;
  const { colors } = useTheme();
  const styles = createStyles(colors);
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput {...inputProps} placeholderTextColor={colors.placeholder} style={styles.input} /></View>;
}

function ProfileRow({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  return <View style={styles.row}><Text style={styles.label}>{label}</Text><Text style={highlight ? styles.highlight : styles.value}>{value}</Text></View>;
}

function QuickTile({ icon, title, onPress }: { icon: React.ComponentProps<typeof Ionicons>["name"]; title: string; onPress?: () => void }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  return (
    <TouchableOpacity onPress={onPress} style={styles.quickTile}>
      <Ionicons name={icon} size={25} color={colors.text} />
      <Text style={styles.quickTitle}>{title}</Text>
    </TouchableOpacity>
  );
}

function MenuRow({
  icon,
  title,
  onPress,
  active = false,
  destructive = false,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  title: string;
  onPress: () => void;
  active?: boolean;
  destructive?: boolean;
}) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  return (
    <TouchableOpacity onPress={onPress} style={[styles.menuRow, active && styles.menuRowActive]}>
      <Ionicons name={icon} size={24} color={destructive ? colors.danger : active ? colors.cyan : colors.text} />
      <Text style={[styles.menuTitle, destructive && styles.menuTitleDanger]}>{title}</Text>
      <Ionicons name={active ? "chevron-up" : "chevron-forward"} size={18} color={colors.muted} />
    </TouchableOpacity>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  page: { padding: 20, paddingBottom: 34 },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 24 },
  screenTitle: { color: colors.text, fontSize: 24, fontWeight: "900" },
  topActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  iconButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  eyebrow: { color: colors.cyan, fontSize: 9, letterSpacing: 1.8, marginBottom: 14 },
  hero: { flexDirection: "row", alignItems: "center", padding: 17, borderWidth: 1, borderColor: colors.heroBorder, backgroundColor: colors.panelRaised },
  identityBlock: { flexDirection: "row", alignItems: "center", marginBottom: 24 },
  avatar: { width: 92, height: 92, borderRadius: 46, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border, backgroundColor: colors.activePanel },
  avatarImage: { width: "100%", height: "100%", borderRadius: 46 },
  initials: { color: colors.cyan, fontSize: 28, fontWeight: "900", letterSpacing: 1 },
  editBadge: { position: "absolute", right: -1, bottom: 2, width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: colors.background, backgroundColor: colors.cyan },
  heroCopy: { marginLeft: 15, flex: 1 },
  identityCopy: { flex: 1, marginLeft: 24 },
  name: { color: colors.text, fontSize: 20, fontWeight: "900" },
  phoneLine: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 11 },
  phone: { color: colors.muted, fontSize: 16, fontWeight: "700" },
  role: { color: colors.amber, fontSize: 9, fontWeight: "900", letterSpacing: 1.4, marginTop: 7 },
  status: { color: colors.green, fontSize: 9, fontWeight: "800", letterSpacing: 1, marginTop: 8 },
  quickGrid: { flexDirection: "row", gap: 10, marginTop: 16, marginBottom: 28 },
  quickTile: { flex: 1, minHeight: 118, justifyContent: "space-between", padding: 16, borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.panelRaised },
  quickTitle: { color: colors.text, fontSize: 16, fontWeight: "900", lineHeight: 21 },
  menu: { marginHorizontal: -20, borderTopWidth: 6, borderTopColor: colors.border, backgroundColor: colors.panel },
  menuRow: { minHeight: 72, flexDirection: "row", alignItems: "center", gap: 18, paddingHorizontal: 24, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.panel },
  menuRowActive: { backgroundColor: colors.activePanel },
  menuTitle: { flex: 1, color: colors.text, fontSize: 18, fontWeight: "800" },
  menuTitleDanger: { color: colors.danger },
  inlinePanel: { paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.bar },
  section: { color: colors.text, fontSize: 12, fontWeight: "800", letterSpacing: 1.4, marginTop: 25, marginBottom: 10 },
  field: { flex: 1, marginBottom: 9 },
  label: { color: colors.muted, fontSize: 9, fontWeight: "800", letterSpacing: 1, marginBottom: 7 },
  input: { color: colors.text, padding: 13, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel, fontSize: 13 },
  row: { padding: 14, marginBottom: 9, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel },
  value: { color: colors.text, fontSize: 13, fontWeight: "700", marginTop: 7 },
  highlight: { color: colors.cyan, fontSize: 13, fontWeight: "800", marginTop: 7 },
  primary: { alignSelf: "flex-start", alignItems: "center", justifyContent: "center", minHeight: 36, marginTop: 7, paddingVertical: 9, paddingHorizontal: 16, backgroundColor: colors.cyan },
  primaryText: { color: colors.buttonText, fontWeight: "900", fontSize: 9, letterSpacing: 1 },
  secondary: { alignItems: "center", padding: 12, marginTop: 10, borderWidth: 1, borderColor: colors.cyan },
  secondaryText: { color: colors.cyan, fontWeight: "900", fontSize: 10, letterSpacing: 1.1 },
  notice: { color: colors.green, fontSize: 11, marginTop: 14 },
  error: { color: colors.danger, fontSize: 11, marginTop: 14 },
  addressCard: { padding: 14, marginBottom: 9, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel },
  addressHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  addressLabel: { color: colors.text, fontSize: 14, fontWeight: "800" },
  defaultBadge: { color: colors.green, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  addressText: { color: colors.muted, fontSize: 11, lineHeight: 17, marginTop: 8 },
  rowActions: { flexDirection: "row", gap: 16, marginTop: 12 },
  link: { color: colors.cyan, fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  deleteLink: { color: colors.danger, fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  empty: { color: colors.muted, fontSize: 12, paddingVertical: 8 },
  addressForm: { padding: 14, marginTop: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bar },
  locationButton: { alignSelf: "flex-end", width: 44, height: 44, alignItems: "center", justifyContent: "center", marginBottom: 10, borderWidth: 1, borderColor: colors.cyan, backgroundColor: colors.panel },
  twoColumns: { flexDirection: "row", gap: 10 },
  checkbox: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 4, marginBottom: 6 },
  checkboxBox: { width: 18, height: 18, borderWidth: 1, borderColor: colors.border },
  checkboxActive: { backgroundColor: colors.cyan, borderColor: colors.cyan },
  checkboxText: { color: colors.text, fontSize: 12, fontWeight: "700" },
  logout: { alignItems: "center", marginTop: 21, padding: 14, borderWidth: 1, borderColor: colors.danger, backgroundColor: colors.dangerPanel },
  logoutText: { color: colors.danger, fontSize: 10, fontWeight: "900", letterSpacing: 1.2 },
  });
}
