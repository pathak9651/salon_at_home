import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { apiRequest } from "../../api/client";
import { ThemeColors, useTheme } from "../../utils/theme";
import { KeyboardAwareScreen } from "../common/KeyboardAwareScreen";
import { ScreenHeader } from "../common/ScreenHeader";

type Booking = {
  id: string;
  scheduledAt: string;
  address: string;
  totalAmount: number;
  status: string;
  client?: { name?: string | null; phone: string; email?: string | null } | null;
  salon?: { id: string; name: string };
  employee?: Employee | null;
  service?: { name: string };
  services?: Array<{ service: { name: string }; price: number }>;
  payment?: { status: string; method?: string | null; platformFee: number; merchantAmount: number; cashRemark?: string | null } | null;
};

type Employee = {
  id: string;
  name: string;
  roleTitle?: string | null;
  isActive: boolean;
  salonId: string;
};

export function OwnerHomeScreen({ token }: { token: string }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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
    void loadBookings();
  }, []);

  async function loadBookings() {
    setLoading(true);
    setError("");
    try {
      const [nextBookings, nextEmployees] = await Promise.all([
        apiRequest<Booking[]>("/bookings", { headers: { Authorization: `Bearer ${token}` } }),
        apiRequest<Employee[]>("/employees", { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      setBookings(nextBookings);
      setEmployees(nextEmployees);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load merchant bookings");
    } finally {
      setLoading(false);
    }
  }

  async function assignEmployee(bookingId: string, employeeId: string | null) {
    setSaving(true);
    setNotice("");
    setError("");
    try {
      await apiRequest<Booking>(`/bookings/${bookingId}/employee`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ employeeId }),
      });
      setNotice(employeeId ? "Employee assigned to booking." : "Employee assignment removed.");
      await loadBookings();
    } catch (assignError) {
      setError(assignError instanceof Error ? assignError.message : "Could not assign employee");
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
      await apiRequest("/payments/cash", {
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
  const requestBookings = bookings.filter((booking) => booking.status === "PENDING");
  const scheduledBookings = bookings.filter((booking) => booking.status === "ACCEPTED");
  const historyBookings = bookings.filter((booking) => !["PENDING", "ACCEPTED"].includes(booking.status));
  const paidEarnings = bookings.filter((booking) => booking.payment?.status === "PAID").reduce((sum, booking) => sum + (booking.payment?.merchantAmount ?? 0), 0);

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.cyan} /></View>;

  return (
    <KeyboardAwareScreen contentContainerStyle={styles.page}>
      <ScreenHeader eyebrow="PARTNER CONSOLE // MERCHANT" title="Booking management" subtitle="Accept requests, schedule visits, assign stylists, and close service by online payment or collected cash." />
      <View style={styles.grid}>
        <Metric styles={styles} label="MERCHANT EARNINGS" value={`INR ${paidEarnings}`} />
        <Metric styles={styles} label="ACTIVE REQUESTS" value={String(activeBookings.length)} />
      </View>
      {!!notice && <Text style={styles.notice}>{notice}</Text>}
      {!!error && <Text style={styles.error}>{error}</Text>}

      <Text style={styles.section}>NEW REQUESTS</Text>
      {!requestBookings.length && <Text style={styles.empty}>No new booking requests.</Text>}
      {requestBookings.map((booking) => (
        <View style={styles.card} key={booking.id}>
          <View style={styles.top}>
            <View style={styles.copy}>
              <Text style={styles.id}>{booking.id.slice(0, 8).toUpperCase()}</Text>
              <Text style={styles.name}>{serviceNames(booking)}</Text>
              <Text style={styles.meta}>{new Date(booking.scheduledAt).toLocaleString()}</Text>
              <Text style={styles.meta}>Location: {booking.address}</Text>
              <Text style={booking.employee ? styles.assigned : styles.privateText}>Assigned: {booking.employee?.name ?? "Not assigned"}</Text>
              {booking.client ? <Text style={styles.client}>Client: {booking.client.name ?? "Client"} | {booking.client.phone}{booking.client.email ? ` | ${booking.client.email}` : ""}</Text> : <Text style={styles.privateText}>Client info unlocks after accepting.</Text>}
            </View>
            <View style={styles.side}>
              <Text style={styles.status}>{booking.status}</Text>
              <Text style={styles.amount}>INR {booking.totalAmount}</Text>
              {booking.payment?.status === "PAID" && <Text style={styles.paid}>{booking.payment.method ?? "PAID"}</Text>}
            </View>
          </View>

          {booking.salon?.id && ["PENDING", "ACCEPTED"].includes(booking.status) && <View style={styles.assignPanel}>
            <Text style={styles.label}>ASSIGN STYLIST</Text>
            <View style={styles.employeeChips}>
              {employees.filter((employee) => employee.isActive && employee.salonId === booking.salon?.id).map((employee) => (
                <TouchableOpacity disabled={saving} onPress={() => void assignEmployee(booking.id, employee.id)} style={[styles.employeeChip, booking.employee?.id === employee.id && styles.employeeChipActive]} key={employee.id}>
                  <Text style={[styles.employeeChipText, booking.employee?.id === employee.id && styles.employeeChipTextActive]}>{employee.name}</Text>
                </TouchableOpacity>
              ))}
              {booking.employee && <TouchableOpacity disabled={saving} onPress={() => void assignEmployee(booking.id, null)} style={styles.employeeChip}><Text style={styles.deleteLink}>CLEAR</Text></TouchableOpacity>}
            </View>
            {!employees.some((employee) => employee.isActive && employee.salonId === booking.salon?.id) && <Text style={styles.empty}>Add employees from Salon setup first.</Text>}
          </View>}

          {booking.status === "PENDING" && <View style={styles.actions}>
            <TouchableOpacity disabled={saving} onPress={() => void updateStatus(booking.id, "ACCEPTED")} style={styles.primary}><Text style={styles.primaryText}>ACCEPT</Text></TouchableOpacity>
            <TouchableOpacity disabled={saving} onPress={() => startReschedule(booking)} style={styles.action}><Text style={styles.link}>RESCHEDULE</Text></TouchableOpacity>
            <TouchableOpacity disabled={saving} onPress={() => void updateStatus(booking.id, "REJECTED")} style={styles.action}><Text style={styles.deleteLink}>REJECT</Text></TouchableOpacity>
          </View>}

          {booking.status === "ACCEPTED" && <View style={styles.actions}>
            <TouchableOpacity disabled={saving} onPress={() => Alert.alert("Close for online payment?", "This marks service complete. The client will pay online in the app, then admin brokerage and merchant amount are tracked.", [{ text: "Cancel" }, { text: "Close online", onPress: () => void updateStatus(booking.id, "COMPLETED") }])} style={styles.primary}><Text style={styles.primaryText}>CLOSE ONLINE</Text></TouchableOpacity>
            <TouchableOpacity disabled={saving} onPress={() => { setCashBookingId(booking.id); setCashRemark(""); }} style={styles.action}><Text style={styles.link}>CLOSE CASH</Text></TouchableOpacity>
            <TouchableOpacity disabled={saving} onPress={() => startReschedule(booking)} style={styles.action}><Text style={styles.link}>RESCHEDULE</Text></TouchableOpacity>
            <TouchableOpacity disabled={saving} onPress={() => Alert.alert("Cancel booking?", "This will cancel the accepted booking request.", [{ text: "Back" }, { text: "Cancel booking", style: "destructive", onPress: () => void updateStatus(booking.id, "CANCELLED") }])} style={styles.action}><Text style={styles.deleteLink}>CANCEL</Text></TouchableOpacity>
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
      ))}

      <Text style={styles.section}>SCHEDULED BOOKINGS</Text>
      {!scheduledBookings.length && <Text style={styles.empty}>No scheduled bookings.</Text>}
      {scheduledBookings.map((booking) => (
        <View style={styles.card} key={booking.id}>
          <View style={styles.top}>
            <View style={styles.copy}>
              <Text style={styles.id}>{booking.id.slice(0, 8).toUpperCase()}</Text>
              <Text style={styles.name}>{serviceNames(booking)}</Text>
              <Text style={styles.meta}>{new Date(booking.scheduledAt).toLocaleString()}</Text>
              <Text style={styles.meta}>Location: {booking.address}</Text>
              <Text style={booking.employee ? styles.assigned : styles.privateText}>Assigned: {booking.employee?.name ?? "Not assigned"}</Text>
              {booking.client ? <Text style={styles.client}>Client: {booking.client.name ?? "Client"} | {booking.client.phone}{booking.client.email ? ` | ${booking.client.email}` : ""}</Text> : null}
            </View>
            <View style={styles.side}>
              <Text style={styles.status}>{booking.status}</Text>
              <Text style={styles.amount}>INR {booking.totalAmount}</Text>
            </View>
          </View>

          {booking.salon?.id && <View style={styles.assignPanel}>
            <Text style={styles.label}>ASSIGN STYLIST</Text>
            <View style={styles.employeeChips}>
              {employees.filter((employee) => employee.isActive && employee.salonId === booking.salon?.id).map((employee) => (
                <TouchableOpacity disabled={saving} onPress={() => void assignEmployee(booking.id, employee.id)} style={[styles.employeeChip, booking.employee?.id === employee.id && styles.employeeChipActive]} key={employee.id}>
                  <Text style={[styles.employeeChipText, booking.employee?.id === employee.id && styles.employeeChipTextActive]}>{employee.name}</Text>
                </TouchableOpacity>
              ))}
              {booking.employee && <TouchableOpacity disabled={saving} onPress={() => void assignEmployee(booking.id, null)} style={styles.employeeChip}><Text style={styles.deleteLink}>CLEAR</Text></TouchableOpacity>}
            </View>
            {!employees.some((employee) => employee.isActive && employee.salonId === booking.salon?.id) && <Text style={styles.empty}>Add employees from Salon setup first.</Text>}
          </View>}

          <View style={styles.closeInfo}>
            <Text style={styles.closeTitle}>CLOSE REQUEST</Text>
            <Text style={styles.closeText}>After service completion, close online so the client pays in app, or close cash with a collection remark for admin records.</Text>
          </View>
          <View style={styles.actions}>
            <TouchableOpacity disabled={saving} onPress={() => Alert.alert("Close for online payment?", "This marks service complete. The client will pay online in the app.", [{ text: "Cancel" }, { text: "Close online", onPress: () => void updateStatus(booking.id, "COMPLETED") }])} style={styles.primary}><Text style={styles.primaryText}>CLOSE ONLINE</Text></TouchableOpacity>
            <TouchableOpacity disabled={saving} onPress={() => { setCashBookingId(booking.id); setCashRemark(""); }} style={styles.action}><Text style={styles.link}>CLOSE CASH</Text></TouchableOpacity>
          </View>
          <View style={styles.actions}>
            <TouchableOpacity disabled={saving} onPress={() => startReschedule(booking)} style={styles.action}><Text style={styles.link}>RESCHEDULE</Text></TouchableOpacity>
            <TouchableOpacity disabled={saving} onPress={() => Alert.alert("Cancel booking?", "This will cancel the accepted booking request.", [{ text: "Back" }, { text: "Cancel booking", style: "destructive", onPress: () => void updateStatus(booking.id, "CANCELLED") }])} style={styles.action}><Text style={styles.deleteLink}>CANCEL</Text></TouchableOpacity>
          </View>

          {cashBookingId === booking.id && <View style={styles.cashPanel}>
            <Text style={styles.label}>CASH COLLECTION REMARK</Text>
            <TextInput value={cashRemark} onChangeText={setCashRemark} placeholder="Example: Collected full cash from client" placeholderTextColor={colors.placeholder} style={styles.cashInput} multiline />
            <TouchableOpacity disabled={saving} onPress={() => void closeWithCash(booking.id)} style={styles.primary}><Text style={styles.primaryText}>CLOSE AS CASH COLLECTED</Text></TouchableOpacity>
          </View>}

          {reschedulingId === booking.id && <View style={styles.reschedulePanel}>
            <TouchableOpacity onPress={() => setShowDatePicker(true)} style={styles.picker}><Text style={styles.label}>NEW DATE</Text><Text style={styles.value}>{rescheduleDate || "Select date"}</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => setShowTimePicker(true)} style={styles.picker}><Text style={styles.label}>NEW TIME</Text><Text style={styles.value}>{rescheduleTime || "Select time"}</Text></TouchableOpacity>
            <TouchableOpacity disabled={saving} onPress={() => void submitReschedule()} style={styles.primary}><Text style={styles.primaryText}>SEND NEW TIME</Text></TouchableOpacity>
          </View>}
        </View>
      ))}

      <Text style={styles.section}>CLOSED / HISTORY</Text>
      {!historyBookings.length && <Text style={styles.empty}>No closed bookings yet.</Text>}
      {historyBookings.map((booking) => (
        <View style={styles.card} key={booking.id}>
          <View style={styles.top}>
            <View style={styles.copy}>
              <Text style={styles.id}>{booking.id.slice(0, 8).toUpperCase()}</Text>
              <Text style={styles.name}>{serviceNames(booking)}</Text>
              <Text style={styles.meta}>{new Date(booking.scheduledAt).toLocaleString()}</Text>
              <Text style={styles.meta}>Location: {booking.address}</Text>
              {!!booking.payment?.method && <Text style={styles.cashNote}>Closed by: {booking.payment.method}{booking.payment.cashRemark ? ` | ${booking.payment.cashRemark}` : ""}</Text>}
              {booking.status === "COMPLETED" && booking.payment?.status !== "PAID" && <Text style={styles.privateText}>Waiting for client online payment.</Text>}
            </View>
            <View style={styles.side}>
              <Text style={styles.status}>{booking.status}</Text>
              <Text style={styles.amount}>INR {booking.totalAmount}</Text>
              {booking.payment?.status === "PAID" && <Text style={styles.paid}>{booking.payment.method ?? "PAID"}</Text>}
            </View>
          </View>
        </View>
      ))}

      {showDatePicker && <DateTimePicker value={dateValue ?? new Date()} mode="date" minimumDate={new Date()} display="default" onChange={updateDate} />}
      {showTimePicker && <DateTimePicker value={timeValue ?? new Date()} mode="time" display="default" onChange={updateTime} />}
    </KeyboardAwareScreen>
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
    card: { padding: 14, marginBottom: 9, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel },
    top: { flexDirection: "row", justifyContent: "space-between", gap: 10 },
    copy: { flex: 1 },
    side: { alignItems: "flex-end" },
    id: { color: colors.cyan, fontSize: 10, fontWeight: "900" },
    name: { color: colors.text, fontSize: 14, fontWeight: "800", marginTop: 7 },
    meta: { color: colors.muted, fontSize: 10, marginTop: 6, lineHeight: 15 },
    client: { color: colors.text, fontSize: 10, fontWeight: "700", marginTop: 8, lineHeight: 15 },
    privateText: { color: colors.amber, fontSize: 10, fontWeight: "800", marginTop: 8 },
    assigned: { color: colors.green, fontSize: 10, fontWeight: "800", marginTop: 8 },
    status: { color: colors.amber, fontSize: 9, fontWeight: "900" },
    amount: { color: colors.cyan, fontSize: 11, fontWeight: "800", marginTop: 8 },
    paid: { color: colors.green, fontSize: 9, fontWeight: "900", marginTop: 8 },
    actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
    assignPanel: { marginTop: 12, padding: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panelRaised },
    employeeChips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    employeeChip: { minHeight: 34, justifyContent: "center", paddingHorizontal: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel },
    employeeChipActive: { borderColor: colors.cyan, backgroundColor: colors.activePanel },
    employeeChipText: { color: colors.muted, fontSize: 10, fontWeight: "900" },
    employeeChipTextActive: { color: colors.cyan },
    primary: { flexGrow: 1, flexBasis: 130, alignItems: "center", justifyContent: "center", minHeight: 42, paddingHorizontal: 12, backgroundColor: colors.cyan },
    primaryText: { color: colors.buttonText, fontWeight: "900", fontSize: 10, letterSpacing: 1 },
    action: { flexGrow: 1, flexBasis: 110, alignItems: "center", justifyContent: "center", minHeight: 42, paddingHorizontal: 10, borderWidth: 1, borderColor: colors.border },
    link: { color: colors.cyan, fontSize: 10, fontWeight: "900", letterSpacing: 1 },
    deleteLink: { color: colors.danger, fontSize: 10, fontWeight: "900", letterSpacing: 1 },
    reschedulePanel: { marginTop: 12, padding: 12, borderWidth: 1, borderColor: colors.heroBorder, backgroundColor: colors.panelRaised },
    cashPanel: { marginTop: 12, padding: 12, borderWidth: 1, borderColor: colors.green, backgroundColor: colors.successPanel },
    closeInfo: { marginTop: 12, padding: 10, borderWidth: 1, borderColor: colors.heroBorder, backgroundColor: colors.panelRaised },
    closeTitle: { color: colors.text, fontSize: 10, fontWeight: "900", letterSpacing: 1 },
    closeText: { color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 6 },
    cashInput: { color: colors.text, minHeight: 70, padding: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel, fontSize: 12, textAlignVertical: "top", marginBottom: 10 },
    cashNote: { color: colors.green, fontSize: 10, lineHeight: 15, marginTop: 10 },
    picker: { padding: 12, marginBottom: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel },
    value: { color: colors.text, fontSize: 13, fontWeight: "700" },
    empty: { color: colors.muted, fontSize: 12, paddingVertical: 8 },
  });
}
