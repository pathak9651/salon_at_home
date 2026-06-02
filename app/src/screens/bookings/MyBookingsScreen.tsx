import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { apiRequest } from "../../api/client";
import { ThemeColors, useTheme } from "../../utils/theme";
import { ScreenHeader } from "../common/ScreenHeader";

type Booking = {
  id: string;
  scheduledAt: string;
  address: string;
  totalAmount: number;
  status: string;
  salon?: { name: string };
  service?: { name: string };
  services?: Array<{ service: { name: string }; price: number }>;
};

export function MyBookingsScreen({ token }: { token: string }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reschedulingBookingId, setReschedulingBookingId] = useState<string | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleTime, setRescheduleTime] = useState("");
  const [rescheduleDateValue, setRescheduleDateValue] = useState<Date | null>(null);
  const [rescheduleTimeValue, setRescheduleTimeValue] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  useEffect(() => {
    void loadBookings();
  }, []);

  async function loadBookings() {
    setLoading(true);
    setError("");
    try {
      setBookings(await apiRequest<Booking[]>("/bookings", { headers: { Authorization: `Bearer ${token}` } }));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load bookings");
    } finally {
      setLoading(false);
    }
  }

  async function cancelBooking(id: string) {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await apiRequest<Booking>(`/bookings/${id}/status`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: "CANCELLED" }),
      });
      setNotice("Booking cancelled");
      await loadBookings();
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : "Could not cancel booking");
    } finally {
      setSaving(false);
    }
  }

  function startReschedule(booking: Booking) {
    const current = new Date(booking.scheduledAt);
    setReschedulingBookingId(booking.id);
    setRescheduleDateValue(current);
    setRescheduleTimeValue(current);
    setRescheduleDate(current.toISOString().slice(0, 10));
    setRescheduleTime(`${String(current.getHours()).padStart(2, "0")}:${String(current.getMinutes()).padStart(2, "0")}`);
  }

  function updateDate(_event: DateTimePickerEvent, selectedDate?: Date) {
    setShowDatePicker(false);
    if (!selectedDate) return;
    setRescheduleDateValue(selectedDate);
    setRescheduleDate(selectedDate.toISOString().slice(0, 10));
  }

  function updateTime(_event: DateTimePickerEvent, selectedTime?: Date) {
    setShowTimePicker(false);
    if (!selectedTime) return;
    setRescheduleTimeValue(selectedTime);
    setRescheduleTime(`${String(selectedTime.getHours()).padStart(2, "0")}:${String(selectedTime.getMinutes()).padStart(2, "0")}`);
  }

  async function submitReschedule(id: string) {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      if (!rescheduleDate || !rescheduleTime) throw new Error("Choose a new date and time");
      const scheduledAt = new Date(`${rescheduleDate}T${rescheduleTime}:00`);
      if (Number.isNaN(scheduledAt.getTime())) throw new Error("Choose a valid date and time");
      await apiRequest<Booking>(`/bookings/${id}/reschedule`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ scheduledAt: scheduledAt.toISOString() }),
      });
      setReschedulingBookingId(null);
      setNotice("Booking rescheduled");
      await loadBookings();
    } catch (rescheduleError) {
      setError(rescheduleError instanceof Error ? rescheduleError.message : "Could not reschedule booking");
    } finally {
      setSaving(false);
    }
  }

  const upcoming = bookings.filter((booking) => ["PENDING", "ACCEPTED"].includes(booking.status) && new Date(booking.scheduledAt) >= new Date());
  const completed = bookings.filter((booking) => !upcoming.some((item) => item.id === booking.id));

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.cyan} /></View>;

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <ScreenHeader eyebrow="BOOKINGS // CLIENT" title="My bookings" subtitle="Track upcoming bookings, reschedule visits, and review completed service history." />
      {!!notice && <Text style={styles.notice}>{notice}</Text>}
      {!!error && <Text style={styles.error}>{error}</Text>}

      <Text style={styles.section}>UPCOMING</Text>
      {upcoming.length ? upcoming.map((booking) => <BookingCard booking={booking} key={booking.id} styles={styles} saving={saving} onCancel={cancelBooking} onStartReschedule={startReschedule} reschedulingBookingId={reschedulingBookingId} rescheduleDate={rescheduleDate} rescheduleTime={rescheduleTime} setShowDatePicker={setShowDatePicker} setShowTimePicker={setShowTimePicker} onSubmitReschedule={submitReschedule} />) : <Text style={styles.empty}>No upcoming bookings.</Text>}

      {showDatePicker && <DateTimePicker value={rescheduleDateValue ?? new Date()} mode="date" minimumDate={new Date()} display="default" onChange={updateDate} />}
      {showTimePicker && <DateTimePicker value={rescheduleTimeValue ?? new Date()} mode="time" display="default" onChange={updateTime} />}

      <Text style={styles.section}>COMPLETED</Text>
      {completed.length ? completed.map((booking) => <BookingCard booking={booking} key={booking.id} styles={styles} />) : <Text style={styles.empty}>No completed bookings yet.</Text>}
    </ScrollView>
  );
}

function BookingCard({
  booking,
  styles,
  saving = false,
  onCancel,
  onStartReschedule,
  reschedulingBookingId,
  rescheduleDate,
  rescheduleTime,
  setShowDatePicker,
  setShowTimePicker,
  onSubmitReschedule,
}: {
  booking: Booking;
  styles: ReturnType<typeof createStyles>;
  saving?: boolean;
  onCancel?: (id: string) => Promise<void>;
  onStartReschedule?: (booking: Booking) => void;
  reschedulingBookingId?: string | null;
  rescheduleDate?: string;
  rescheduleTime?: string;
  setShowDatePicker?: (show: boolean) => void;
  setShowTimePicker?: (show: boolean) => void;
  onSubmitReschedule?: (id: string) => Promise<void>;
}) {
  const canManage = ["PENDING", "ACCEPTED"].includes(booking.status) && !!onCancel && !!onStartReschedule;
  const isRescheduling = reschedulingBookingId === booking.id;
  const serviceNames = booking.services?.length ? booking.services.map((item) => item.service.name).join(", ") : booking.service?.name ?? "Salon service";

  return (
    <View style={styles.bookingCard}>
      <View style={styles.bookingTop}>
        <View style={styles.bookingCopy}>
          <Text style={styles.bookingTitle}>{serviceNames}</Text>
          <Text style={styles.bookingMeta}>{booking.salon?.name ?? "Salon"} | {new Date(booking.scheduledAt).toLocaleString()}</Text>
          <Text style={styles.bookingMeta}>{booking.address}</Text>
        </View>
        <View style={styles.bookingSide}>
          <Text style={styles.bookingStatus}>{booking.status}</Text>
          <Text style={styles.bookingAmount}>INR {booking.totalAmount}</Text>
        </View>
      </View>
      {canManage && <View style={styles.bookingActions}>
        <TouchableOpacity disabled={saving} onPress={() => onStartReschedule?.(booking)} style={styles.bookingAction}><Text style={styles.link}>RESCHEDULE</Text></TouchableOpacity>
        <TouchableOpacity disabled={saving} onPress={() => Alert.alert("Cancel booking?", "This will cancel your upcoming booking.", [{ text: "Keep" }, { text: "Cancel booking", style: "destructive", onPress: () => void onCancel?.(booking.id) }])} style={styles.bookingAction}><Text style={styles.deleteLink}>CANCEL</Text></TouchableOpacity>
      </View>}
      {isRescheduling && <View style={styles.reschedulePanel}>
        <TouchableOpacity onPress={() => setShowDatePicker?.(true)} style={styles.reschedulePicker}><Text style={styles.label}>NEW DATE</Text><Text style={styles.value}>{rescheduleDate || "Select date"}</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => setShowTimePicker?.(true)} style={styles.reschedulePicker}><Text style={styles.label}>NEW TIME</Text><Text style={styles.value}>{rescheduleTime || "Select time"}</Text></TouchableOpacity>
        <TouchableOpacity disabled={saving} onPress={() => void onSubmitReschedule?.(booking.id)} style={styles.primary}><Text style={styles.primaryText}>SAVE NEW TIME</Text></TouchableOpacity>
      </View>}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    center: { flex: 1, alignItems: "center", justifyContent: "center" },
    page: { padding: 20, paddingBottom: 34 },
    section: { color: colors.text, fontSize: 12, fontWeight: "800", letterSpacing: 1.4, marginTop: 22, marginBottom: 10 },
    notice: { color: colors.green, fontSize: 11, marginBottom: 8 },
    error: { color: colors.danger, fontSize: 11, marginBottom: 8 },
    empty: { color: colors.muted, fontSize: 12, paddingVertical: 8 },
    bookingCard: { padding: 14, marginBottom: 9, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel },
    bookingTop: { flexDirection: "row", justifyContent: "space-between", gap: 10 },
    bookingCopy: { flex: 1 },
    bookingTitle: { color: colors.text, fontSize: 14, fontWeight: "800" },
    bookingMeta: { color: colors.muted, fontSize: 10, marginTop: 6 },
    bookingSide: { alignItems: "flex-end" },
    bookingStatus: { color: colors.amber, fontSize: 9, fontWeight: "900" },
    bookingAmount: { color: colors.cyan, fontSize: 11, fontWeight: "800", marginTop: 8 },
    bookingActions: { flexDirection: "row", gap: 10, marginTop: 12 },
    bookingAction: { flex: 1, alignItems: "center", padding: 10, borderWidth: 1, borderColor: colors.border },
    link: { color: colors.cyan, fontSize: 10, fontWeight: "900", letterSpacing: 1 },
    deleteLink: { color: colors.danger, fontSize: 10, fontWeight: "900", letterSpacing: 1 },
    reschedulePanel: { marginTop: 12, padding: 12, borderWidth: 1, borderColor: colors.heroBorder, backgroundColor: colors.panelRaised },
    reschedulePicker: { padding: 12, marginBottom: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel },
    label: { color: colors.muted, fontSize: 9, fontWeight: "800", letterSpacing: 1, marginBottom: 7 },
    value: { color: colors.text, fontSize: 13, fontWeight: "700" },
    primary: { alignItems: "center", justifyContent: "center", minHeight: 44, marginTop: 2, padding: 12, backgroundColor: colors.cyan },
    primaryText: { color: colors.buttonText, fontWeight: "900", fontSize: 10, letterSpacing: 1.2 },
  });
}
