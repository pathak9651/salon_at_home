import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { apiAssetUrl, API_URL, apiRequest } from "../../api/client";
import { ThemeColors, useTheme } from "../../utils/theme";
import { ScreenHeader } from "../common/ScreenHeader";

type Booking = {
  id: string;
  scheduledAt: string;
  address: string;
  totalAmount: number;
  status: string;
  client?: { name?: string | null; phone: string; email?: string | null } | null;
  salon?: { name: string };
  service?: { name: string };
  services?: Array<{ service: { name: string }; price: number }>;
  payment?: { status: string; method?: string | null; platformFee: number; merchantAmount: number; cashRemark?: string | null } | null;
};

type Salon = {
  id: string;
  name: string;
  description?: string | null;
  address: string;
  latitude: number;
  longitude: number;
  imageUrl?: string | null;
  isVerified: boolean;
  images: Array<{ id: string; url: string; caption?: string | null }>;
  services: Array<{ id: string; name: string; price: number; durationMin: number }>;
  owner?: { name?: string | null; phone: string; email?: string | null; emailVerified: boolean };
};

type Profile = {
  name?: string | null;
  phone: string;
  email?: string | null;
  emailVerified: boolean;
};

const emptySalonForm = {
  name: "",
  description: "",
  address: "",
  latitude: "",
  longitude: "",
};

export function OwnerHomeScreen({ token }: { token: string }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [salons, setSalons] = useState<Salon[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [detectingLocation, setDetectingLocation] = useState(false);
  const [salonForm, setSalonForm] = useState(emptySalonForm);
  const [salonImages, setSalonImages] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [reschedulingId, setReschedulingId] = useState<string | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleTime, setRescheduleTime] = useState("");
  const [dateValue, setDateValue] = useState<Date | null>(null);
  const [timeValue, setTimeValue] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [cashBookingId, setCashBookingId] = useState<string | null>(null);
  const [cashRemark, setCashRemark] = useState("");

  useEffect(() => {
    void loadOwnerData();
  }, []);

  async function loadOwnerData() {
    setLoading(true);
    setError("");
    try {
      const [nextBookings, nextSalons, nextProfile] = await Promise.all([
        apiRequest<Booking[]>("/bookings", { headers: { Authorization: `Bearer ${token}` } }),
        apiRequest<Salon[]>("/salons/mine", { headers: { Authorization: `Bearer ${token}` } }),
        apiRequest<Profile>("/profile", { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      setBookings(nextBookings);
      setSalons(nextSalons);
      setProfile(nextProfile);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load merchant workspace");
    } finally {
      setLoading(false);
    }
  }

  async function loadBookings() {
    setLoading(true);
    setError("");
    try {
      setBookings(await apiRequest<Booking[]>("/bookings", { headers: { Authorization: `Bearer ${token}` } }));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load merchant bookings");
    } finally {
      setLoading(false);
    }
  }

  async function pickSalonImages() {
    setNotice("");
    setError("");
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError("Allow photo access to upload salon images.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: true,
      mediaTypes: ["images"],
      quality: 0.82,
      selectionLimit: 5,
    });
    if (!result.canceled) {
      setSalonImages(result.assets.slice(0, 5));
    }
  }

  async function detectSalonAddress() {
    setDetectingLocation(true);
    setNotice("");
    setError("");
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) throw new Error("Allow location access to detect the salon address.");
      const position = await Location.getCurrentPositionAsync({});
      const places = await Location.reverseGeocodeAsync(position.coords);
      const place = places[0];
      const address = [
        place?.name,
        place?.street,
        place?.district,
        place?.city,
        place?.region,
        place?.postalCode,
      ].filter(Boolean).join(", ");
      setSalonForm((current) => ({
        ...current,
        address: address || current.address,
        latitude: position.coords.latitude.toFixed(6),
        longitude: position.coords.longitude.toFixed(6),
      }));
      setNotice("Location detected. Review the salon address before registering.");
    } catch (locationError) {
      setError(locationError instanceof Error ? locationError.message : "Could not detect salon location");
    } finally {
      setDetectingLocation(false);
    }
  }

  async function uploadSalonImage(salonId: string, asset: ImagePicker.ImagePickerAsset) {
    const image = await fetch(asset.uri);
    const body = await image.blob();
    const response = await fetch(`${API_URL}/salons/${salonId}/images/upload`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": asset.mimeType ?? "image/jpeg",
      },
      body,
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      throw new Error(payload?.error ?? "Could not upload salon image");
    }
  }

  async function registerSalon() {
    setSaving(true);
    setNotice("");
    setError("");
    try {
      if (!salonForm.name.trim()) throw new Error("Add the salon name");
      if (!salonForm.address.trim()) throw new Error("Add the salon address");
      if (!salonForm.latitude.trim() || !salonForm.longitude.trim()) throw new Error("Add latitude and longitude or auto-detect location");

      const created = await apiRequest<Salon>("/salons", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: salonForm.name,
          description: salonForm.description,
          address: salonForm.address,
          latitude: Number(salonForm.latitude),
          longitude: Number(salonForm.longitude),
        }),
      });
      for (const image of salonImages) {
        await uploadSalonImage(created.id, image);
      }
      setSalonForm(emptySalonForm);
      setSalonImages([]);
      setNotice("Salon registered successfully. Admin verification is pending.");
      await loadOwnerData();
    } catch (registerError) {
      setError(registerError instanceof Error ? registerError.message : "Could not register salon");
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(id: string, status: "ACCEPTED" | "REJECTED" | "COMPLETED" | "CANCELLED") {
    setSaving(true);
    setNotice("");
    setError("");
    try {
      await apiRequest<Booking>(`/bookings/${id}/status`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status }),
      });
      setNotice(status === "COMPLETED" ? "Service completed. Client can now pay in the app." : `Booking ${status.toLowerCase()}`);
      await loadBookings();
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : "Could not update booking");
    } finally {
      setSaving(false);
    }
  }

  async function closeWithCash(id: string) {
    setSaving(true);
    setNotice("");
    setError("");
    try {
      if (!cashRemark.trim()) throw new Error("Add a cash collection remark");
      await apiRequest(`/payments/cash`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ bookingId: id, remark: cashRemark }),
      });
      setCashBookingId(null);
      setCashRemark("");
      setNotice("Booking closed as cash collected. Admin can see the remark.");
      await loadBookings();
    } catch (cashError) {
      setError(cashError instanceof Error ? cashError.message : "Could not close booking with cash");
    } finally {
      setSaving(false);
    }
  }

  function startReschedule(booking: Booking) {
    const current = new Date(booking.scheduledAt);
    setReschedulingId(booking.id);
    setDateValue(current);
    setTimeValue(current);
    setRescheduleDate(current.toISOString().slice(0, 10));
    setRescheduleTime(`${String(current.getHours()).padStart(2, "0")}:${String(current.getMinutes()).padStart(2, "0")}`);
  }

  function updateDate(_event: DateTimePickerEvent, selectedDate?: Date) {
    setShowDatePicker(false);
    if (!selectedDate) return;
    setDateValue(selectedDate);
    setRescheduleDate(selectedDate.toISOString().slice(0, 10));
  }

  function updateTime(_event: DateTimePickerEvent, selectedTime?: Date) {
    setShowTimePicker(false);
    if (!selectedTime) return;
    setTimeValue(selectedTime);
    setRescheduleTime(`${String(selectedTime.getHours()).padStart(2, "0")}:${String(selectedTime.getMinutes()).padStart(2, "0")}`);
  }

  async function submitReschedule() {
    if (!reschedulingId) return;
    setSaving(true);
    setNotice("");
    setError("");
    try {
      if (!rescheduleDate || !rescheduleTime) throw new Error("Choose a new date and time");
      const scheduledAt = new Date(`${rescheduleDate}T${rescheduleTime}:00`);
      if (Number.isNaN(scheduledAt.getTime())) throw new Error("Choose a valid date and time");
      await apiRequest<Booking>(`/bookings/${reschedulingId}/reschedule`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ scheduledAt: scheduledAt.toISOString() }),
      });
      setReschedulingId(null);
      setNotice("Booking rescheduled");
      await loadBookings();
    } catch (rescheduleError) {
      setError(rescheduleError instanceof Error ? rescheduleError.message : "Could not reschedule booking");
    } finally {
      setSaving(false);
    }
  }

  const activeBookings = bookings.filter((booking) => ["PENDING", "ACCEPTED"].includes(booking.status));
  const paidEarnings = bookings.filter((booking) => booking.payment?.status === "PAID").reduce((sum, booking) => sum + (booking.payment?.merchantAmount ?? 0), 0);

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.cyan} /></View>;

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <ScreenHeader eyebrow="PARTNER CONSOLE // MERCHANT" title="Booking requests" subtitle="Accept requests, complete services, and track payable earnings." />
      <View style={styles.grid}>
        <Metric styles={styles} label="MERCHANT EARNINGS" value={`INR ${paidEarnings}`} />
        <Metric styles={styles} label="ACTIVE REQUESTS" value={String(activeBookings.length)} />
      </View>
      {!!notice && <Text style={styles.notice}>{notice}</Text>}
      {!!error && <Text style={styles.error}>{error}</Text>}

      <Text style={styles.section}>SALON REGISTRATION</Text>
      <View style={styles.formCard}>
        <View style={styles.contactPanel}>
          <Text style={styles.label}>CONTACT INFORMATION</Text>
          <Text style={styles.contactText}>{profile?.name ?? "Owner"} | {profile?.phone ?? "Phone not added"}</Text>
          <Text style={profile?.emailVerified ? styles.verified : styles.pending}>{profile?.emailVerified ? "EMAIL VERIFIED" : "EMAIL VERIFICATION PENDING"}</Text>
        </View>
        <TextInput value={salonForm.name} onChangeText={(name) => setSalonForm((current) => ({ ...current, name }))} placeholder="Salon name" placeholderTextColor={colors.placeholder} style={styles.input} />
        <TextInput value={salonForm.description} onChangeText={(description) => setSalonForm((current) => ({ ...current, description }))} placeholder="Salon details and specialties" placeholderTextColor={colors.placeholder} style={[styles.input, styles.textArea]} multiline />
        <View style={styles.addressRow}>
          <TextInput value={salonForm.address} onChangeText={(address) => setSalonForm((current) => ({ ...current, address }))} placeholder="Salon address" placeholderTextColor={colors.placeholder} style={[styles.input, styles.addressInput]} multiline />
          <TouchableOpacity disabled={detectingLocation} onPress={() => void detectSalonAddress()} style={styles.locationButton}>
            {detectingLocation ? <ActivityIndicator color={colors.cyan} /> : <Text style={styles.locationText}>LOC</Text>}
          </TouchableOpacity>
        </View>
        <View style={styles.twoColumns}>
          <TextInput value={salonForm.latitude} onChangeText={(latitude) => setSalonForm((current) => ({ ...current, latitude }))} placeholder="Latitude" placeholderTextColor={colors.placeholder} keyboardType="decimal-pad" style={styles.input} />
          <TextInput value={salonForm.longitude} onChangeText={(longitude) => setSalonForm((current) => ({ ...current, longitude }))} placeholder="Longitude" placeholderTextColor={colors.placeholder} keyboardType="decimal-pad" style={styles.input} />
        </View>
        <View style={styles.imageActions}>
          <TouchableOpacity onPress={() => void pickSalonImages()} style={styles.action}><Text style={styles.link}>ADD IMAGES</Text></TouchableOpacity>
          <TouchableOpacity disabled={saving} onPress={() => void registerSalon()} style={styles.primary}><Text style={styles.primaryText}>{saving ? "SAVING" : "REGISTER SALON"}</Text></TouchableOpacity>
        </View>
        {salonImages.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.previewStrip}>{salonImages.map((image) => <Image key={image.uri} source={{ uri: image.uri }} style={styles.previewImage} />)}</ScrollView> : null}
      </View>

      {salons.length ? salons.map((salon) => (
        <View style={styles.salonCard} key={salon.id}>
          {salon.imageUrl || salon.images[0]?.url ? <Image source={{ uri: apiAssetUrl(salon.imageUrl ?? salon.images[0]?.url) }} style={styles.salonThumb} /> : <View style={styles.salonFallback}><Text style={styles.id}>SA</Text></View>}
          <View style={styles.copy}>
            <Text style={styles.name}>{salon.name}</Text>
            <Text style={salon.isVerified ? styles.verified : styles.pending}>{salon.isVerified ? "SALON VERIFIED" : "ADMIN VERIFICATION PENDING"}</Text>
            <Text style={styles.meta}>{salon.address}</Text>
            <Text style={styles.meta}>{salon.images.length} image(s) | {salon.services.length} service(s)</Text>
          </View>
        </View>
      )) : <Text style={styles.empty}>No salon registered yet.</Text>}

      <Text style={styles.section}>REQUEST QUEUE</Text>
      {bookings.length ? bookings.map((booking) => (
        <View style={styles.card} key={booking.id}>
          <View style={styles.top}>
            <View style={styles.copy}>
              <Text style={styles.id}>{booking.id.slice(0, 8).toUpperCase()}</Text>
              <Text style={styles.name}>{serviceNames(booking)}</Text>
              <Text style={styles.meta}>{new Date(booking.scheduledAt).toLocaleString()}</Text>
              <Text style={styles.meta}>Location: {booking.address}</Text>
              {booking.client ? <Text style={styles.client}>Client: {booking.client.name ?? "Client"} | {booking.client.phone}{booking.client.email ? ` | ${booking.client.email}` : ""}</Text> : <Text style={styles.privateText}>Client info unlocks after accepting.</Text>}
            </View>
            <View style={styles.side}>
              <Text style={styles.status}>{booking.status}</Text>
              <Text style={styles.amount}>INR {booking.totalAmount}</Text>
              {booking.payment?.status === "PAID" && <Text style={styles.paid}>{booking.payment.method ?? "PAID"}</Text>}
            </View>
          </View>

          {booking.status === "PENDING" && <View style={styles.actions}>
            <TouchableOpacity disabled={saving} onPress={() => void updateStatus(booking.id, "ACCEPTED")} style={styles.primary}><Text style={styles.primaryText}>ACCEPT</Text></TouchableOpacity>
            <TouchableOpacity disabled={saving} onPress={() => startReschedule(booking)} style={styles.action}><Text style={styles.link}>RESCHEDULE</Text></TouchableOpacity>
            <TouchableOpacity disabled={saving} onPress={() => void updateStatus(booking.id, "REJECTED")} style={styles.action}><Text style={styles.deleteLink}>REJECT</Text></TouchableOpacity>
          </View>}

          {booking.status === "ACCEPTED" && <View style={styles.actions}>
            <TouchableOpacity disabled={saving} onPress={() => Alert.alert("Close for online payment?", "This completes the service and lets the client pay online in the app.", [{ text: "Cancel" }, { text: "Close online", onPress: () => void updateStatus(booking.id, "COMPLETED") }])} style={styles.primary}><Text style={styles.primaryText}>ONLINE</Text></TouchableOpacity>
            <TouchableOpacity disabled={saving} onPress={() => { setCashBookingId(booking.id); setCashRemark(""); }} style={styles.action}><Text style={styles.link}>CASH</Text></TouchableOpacity>
            <TouchableOpacity disabled={saving} onPress={() => startReschedule(booking)} style={styles.action}><Text style={styles.link}>RESCHEDULE</Text></TouchableOpacity>
          </View>}

          {cashBookingId === booking.id && <View style={styles.cashPanel}>
            <Text style={styles.label}>CASH COLLECTION REMARK</Text>
            <TextInput value={cashRemark} onChangeText={setCashRemark} placeholder="Example: Collected full cash from client" placeholderTextColor={colors.placeholder} style={styles.cashInput} multiline />
            <TouchableOpacity disabled={saving} onPress={() => void closeWithCash(booking.id)} style={styles.primary}><Text style={styles.primaryText}>CLOSE AS CASH COLLECTED</Text></TouchableOpacity>
          </View>}

          {booking.payment?.method === "CASH" && !!booking.payment.cashRemark && <Text style={styles.cashNote}>Cash remark: {booking.payment.cashRemark}</Text>}

          {reschedulingId === booking.id && <View style={styles.reschedulePanel}>
            <TouchableOpacity onPress={() => setShowDatePicker(true)} style={styles.picker}><Text style={styles.label}>NEW DATE</Text><Text style={styles.value}>{rescheduleDate || "Select date"}</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => setShowTimePicker(true)} style={styles.picker}><Text style={styles.label}>NEW TIME</Text><Text style={styles.value}>{rescheduleTime || "Select time"}</Text></TouchableOpacity>
            <TouchableOpacity disabled={saving} onPress={() => void submitReschedule()} style={styles.primary}><Text style={styles.primaryText}>SEND NEW TIME</Text></TouchableOpacity>
          </View>}
        </View>
      )) : <Text style={styles.empty}>No merchant bookings yet.</Text>}

      {showDatePicker && <DateTimePicker value={dateValue ?? new Date()} mode="date" minimumDate={new Date()} display="default" onChange={updateDate} />}
      {showTimePicker && <DateTimePicker value={timeValue ?? new Date()} mode="time" display="default" onChange={updateTime} />}
    </ScrollView>
  );
}

function serviceNames(booking: Booking) {
  return booking.services?.length ? booking.services.map((item) => item.service.name).join(", ") : booking.service?.name ?? "Salon service";
}

function Metric({ label, value, styles }: { label: string; value: string; styles: ReturnType<typeof createStyles> }) {
  return <View style={styles.metric}><Text style={styles.label}>{label}</Text><Text style={styles.metricValue}>{value}</Text></View>;
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    center: { flex: 1, alignItems: "center", justifyContent: "center" },
    page: { padding: 20, paddingBottom: 34 },
    grid: { flexDirection: "row", gap: 10 },
    metric: { flex: 1, padding: 15, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panelRaised },
    label: { color: colors.muted, fontSize: 9, fontWeight: "800", letterSpacing: 1, marginBottom: 7 },
    metricValue: { color: colors.text, fontSize: 20, fontWeight: "800", marginTop: 8 },
    notice: { color: colors.green, fontSize: 11, marginTop: 14 },
    error: { color: colors.danger, fontSize: 11, marginTop: 14 },
    section: { color: colors.text, fontSize: 12, fontWeight: "800", letterSpacing: 1.4, marginTop: 24, marginBottom: 10 },
    formCard: { padding: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel },
    contactPanel: { padding: 12, marginBottom: 10, borderWidth: 1, borderColor: colors.heroBorder, backgroundColor: colors.panelRaised },
    contactText: { color: colors.text, fontSize: 12, fontWeight: "700", lineHeight: 18 },
    verified: { color: colors.green, fontSize: 9, fontWeight: "900", letterSpacing: 1, marginTop: 7 },
    pending: { color: colors.amber, fontSize: 9, fontWeight: "900", letterSpacing: 1, marginTop: 7 },
    input: { flex: 1, color: colors.text, minHeight: 42, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panelRaised, fontSize: 12 },
    textArea: { minHeight: 74, textAlignVertical: "top" },
    addressRow: { flexDirection: "row", alignItems: "stretch", gap: 8 },
    addressInput: { minHeight: 70, textAlignVertical: "top" },
    locationButton: { width: 46, height: 46, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.cyan, backgroundColor: colors.panelRaised },
    locationText: { color: colors.cyan, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
    twoColumns: { flexDirection: "row", gap: 8 },
    imageActions: { flexDirection: "row", gap: 8, marginTop: 2 },
    previewStrip: { marginTop: 10 },
    previewImage: { width: 78, height: 78, marginRight: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panelRaised },
    salonCard: { flexDirection: "row", gap: 12, padding: 12, marginTop: 9, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel },
    salonThumb: { width: 72, height: 72, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panelRaised },
    salonFallback: { width: 72, height: 72, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panelRaised },
    card: { padding: 14, marginBottom: 9, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel },
    top: { flexDirection: "row", justifyContent: "space-between", gap: 10 },
    copy: { flex: 1 },
    side: { alignItems: "flex-end" },
    id: { color: colors.cyan, fontSize: 10, fontWeight: "900" },
    name: { color: colors.text, fontSize: 14, fontWeight: "800", marginTop: 7 },
    meta: { color: colors.muted, fontSize: 10, marginTop: 6, lineHeight: 15 },
    client: { color: colors.text, fontSize: 10, fontWeight: "700", marginTop: 8, lineHeight: 15 },
    privateText: { color: colors.amber, fontSize: 10, fontWeight: "800", marginTop: 8 },
    status: { color: colors.amber, fontSize: 9, fontWeight: "900" },
    amount: { color: colors.cyan, fontSize: 11, fontWeight: "800", marginTop: 8 },
    paid: { color: colors.green, fontSize: 9, fontWeight: "900", marginTop: 8 },
    actions: { flexDirection: "row", gap: 8, marginTop: 12 },
    primary: { flex: 1, alignItems: "center", justifyContent: "center", minHeight: 42, paddingHorizontal: 12, backgroundColor: colors.cyan },
    primaryText: { color: colors.buttonText, fontWeight: "900", fontSize: 10, letterSpacing: 1 },
    action: { flex: 1, alignItems: "center", justifyContent: "center", minHeight: 42, paddingHorizontal: 10, borderWidth: 1, borderColor: colors.border },
    link: { color: colors.cyan, fontSize: 10, fontWeight: "900", letterSpacing: 1 },
    deleteLink: { color: colors.danger, fontSize: 10, fontWeight: "900", letterSpacing: 1 },
    reschedulePanel: { marginTop: 12, padding: 12, borderWidth: 1, borderColor: colors.heroBorder, backgroundColor: colors.panelRaised },
    cashPanel: { marginTop: 12, padding: 12, borderWidth: 1, borderColor: colors.green, backgroundColor: colors.successPanel },
    cashInput: { color: colors.text, minHeight: 70, padding: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel, fontSize: 12, textAlignVertical: "top", marginBottom: 10 },
    cashNote: { color: colors.green, fontSize: 10, lineHeight: 15, marginTop: 10 },
    picker: { padding: 12, marginBottom: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel },
    value: { color: colors.text, fontSize: 13, fontWeight: "700" },
    empty: { color: colors.muted, fontSize: 12, paddingVertical: 8 },
  });
}
