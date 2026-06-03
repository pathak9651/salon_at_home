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
  client?: { id: string; name?: string | null; phone: string; email?: string | null } | null;
  salon?: { id: string; name: string };
  employee?: Employee | null;
  service?: { name: string };
  services?: Array<{ service: { name: string }; price: number }>;
  payment?: { status: string; method?: string | null; platformFee: number; merchantAmount: number; cashRemark?: string | null } | null;
};

type Payment = {
  id: string;
  amount: number;
  status: string;
  method?: string | null;
  platformFee: number;
  merchantAmount: number;
  paidAt?: string | null;
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
  const [payments, setPayments] = useState<Payment[]>([]);
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
      const [nextBookings, nextEmployees, nextPayments] = await Promise.all([
        apiRequest<Booking[]>("/bookings", { headers: { Authorization: `Bearer ${token}` } }),
        apiRequest<Employee[]>("/employees", { headers: { Authorization: `Bearer ${token}` } }),
        apiRequest<Payment[]>("/payments", { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      setBookings(nextBookings);
      setEmployees(nextEmployees);
      setPayments(nextPayments);
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

  async function updateStatus(id: string, status: "ACCEPTED" | "REJECTED" | "PAYMENT_PENDING" | "CANCELLED") {
    setSaving(true);
    setNotice("");
    setError("");
    try {
      await apiRequest<Booking>(`/bookings/${id}/status`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status }),
      });
      setNotice(status === "PAYMENT_PENDING" ? "Online payment requested. Booking will close after successful payment." : `Booking ${status.toLowerCase()}`);
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
      setNotice("Cash confirmation requested. Booking will close after the client confirms.");
      await loadBookings();
    } catch (cashError) {
      setError(cashError instanceof Error ? cashError.message : "Could not request cash confirmation");
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

  const activeBookings = bookings.filter((booking) => ["PENDING", "ACCEPTED", "PAYMENT_PENDING"].includes(booking.status));
  const requestBookings = bookings.filter((booking) => booking.status === "PENDING");
  const scheduledBookings = bookings.filter((booking) => booking.status === "ACCEPTED");
  const paymentPendingBookings = bookings.filter((booking) => booking.status === "PAYMENT_PENDING");
  const historyBookings = bookings.filter((booking) => !["PENDING", "ACCEPTED", "PAYMENT_PENDING"].includes(booking.status));
  const paidEarnings = bookings.filter((booking) => booking.payment?.status === "PAID").reduce((sum, booking) => sum + (booking.payment?.merchantAmount ?? 0), 0);
  const todayKey = new Date().toDateString();
  const paidPayments = payments.filter((payment) => payment.status === "PAID");
  const dailyEarnings = paidPayments
    .filter((payment) => payment.paidAt && new Date(payment.paidAt).toDateString() === todayKey)
    .reduce((sum, payment) => sum + payment.merchantAmount, 0);
  const uniqueCustomerIds = new Set(bookings.map((booking) => booking.client?.id ?? booking.client?.phone).filter(Boolean));
  const completedCount = bookings.filter((booking) => booking.status === "COMPLETED").length;
  const repeatCustomers = [...uniqueCustomerIds].filter((customerId) => bookings.filter((booking) => (booking.client?.id ?? booking.client?.phone) === customerId).length > 1).length;
  const conversionRate = bookings.length ? Math.round((completedCount / bookings.length) * 100) : 0;

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.cyan} /></View>;

  return (
    <KeyboardAwareScreen contentContainerStyle={styles.page}>
      <ScreenHeader eyebrow="PARTNER CONSOLE // MERCHANT" title="Salon dashboard" subtitle="Track bookings, daily earnings, booking analytics, customers, and request actions." />
      <View style={styles.grid}>
        <Metric styles={styles} label="TOTAL BOOKINGS" value={String(bookings.length)} />
        <Metric styles={styles} label="DAILY EARNINGS" value={`INR ${dailyEarnings}`} />
      </View>
      <View style={styles.grid}>
        <Metric styles={styles} label="MERCHANT EARNINGS" value={`INR ${paidEarnings}`} />
        <Metric styles={styles} label="ACTIVE REQUESTS" value={String(activeBookings.length)} />
      </View>
      <Text style={styles.section}>BOOKING ANALYTICS</Text>
      <View style={styles.analyticsGrid}>
        <AnalyticsCard styles={styles} label="Pending" value={requestBookings.length} />
        <AnalyticsCard styles={styles} label="Scheduled" value={scheduledBookings.length} />
        <AnalyticsCard styles={styles} label="Completed" value={completedCount} />
        <AnalyticsCard styles={styles} label="Rejected" value={bookings.filter((booking) => booking.status === "REJECTED").length} />
        <AnalyticsCard styles={styles} label="Cancelled" value={bookings.filter((booking) => booking.status === "CANCELLED").length} />
        <AnalyticsCard styles={styles} label="Conversion" value={`${conversionRate}%`} />
      </View>
      <Text style={styles.section}>CUSTOMER STATISTICS</Text>
      <View style={styles.grid}>
        <Metric styles={styles} label="TOTAL CUSTOMERS" value={String(uniqueCustomerIds.size)} />
        <Metric styles={styles} label="REPEAT CUSTOMERS" value={String(repeatCustomers)} />
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
            <TouchableOpacity disabled={saving} onPress={() => Alert.alert("Request online payment?", "This keeps the request open until the client pays online. After successful payment, the booking will close automatically.", [{ text: "Cancel" }, { text: "Request payment", onPress: () => void updateStatus(booking.id, "PAYMENT_PENDING") }])} style={styles.primary}><Text style={styles.primaryText}>REQUEST ONLINE PAYMENT</Text></TouchableOpacity>
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
            <Text style={styles.closeText}>After service completion, request online payment so the booking closes only after client payment, or close cash with a collection remark.</Text>
          </View>
          <View style={styles.actions}>
            <TouchableOpacity disabled={saving} onPress={() => Alert.alert("Request online payment?", "This keeps the request open until the client pays online. After successful payment, the booking will close automatically.", [{ text: "Cancel" }, { text: "Request payment", onPress: () => void updateStatus(booking.id, "PAYMENT_PENDING") }])} style={styles.primary}><Text style={styles.primaryText}>REQUEST ONLINE PAYMENT</Text></TouchableOpacity>
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

      <Text style={styles.section}>WAITING FOR ONLINE PAYMENT</Text>
      {!paymentPendingBookings.length && <Text style={styles.empty}>No online payment requests waiting.</Text>}
      {paymentPendingBookings.map((booking) => (
        <View style={styles.card} key={booking.id}>
          <View style={styles.top}>
            <View style={styles.copy}>
              <Text style={styles.id}>{booking.id.slice(0, 8).toUpperCase()}</Text>
              <Text style={styles.name}>{serviceNames(booking)}</Text>
              <Text style={styles.meta}>{new Date(booking.scheduledAt).toLocaleString()}</Text>
              <Text style={styles.meta}>Location: {booking.address}</Text>
              <Text style={styles.privateText}>Request is still open. It will close only after successful online payment.</Text>
              {booking.client ? <Text style={styles.client}>Client: {booking.client.name ?? "Client"} | {booking.client.phone}{booking.client.email ? ` | ${booking.client.email}` : ""}</Text> : null}
            </View>
            <View style={styles.side}>
              <Text style={styles.status}>{booking.status}</Text>
              <Text style={styles.amount}>INR {booking.totalAmount}</Text>
            </View>
          </View>
          <View style={styles.actions}>
            <TouchableOpacity disabled={saving} onPress={() => { setCashBookingId(booking.id); setCashRemark(""); }} style={styles.action}><Text style={styles.link}>CLOSE CASH</Text></TouchableOpacity>
          </View>
          {cashBookingId === booking.id && <View style={styles.cashPanel}>
            <Text style={styles.label}>CASH COLLECTION REMARK</Text>
            <TextInput value={cashRemark} onChangeText={setCashRemark} placeholder="Example: Client paid cash instead of online" placeholderTextColor={colors.placeholder} style={styles.cashInput} multiline />
            <TouchableOpacity disabled={saving} onPress={() => void closeWithCash(booking.id)} style={styles.primary}><Text style={styles.primaryText}>CLOSE AS CASH COLLECTED</Text></TouchableOpacity>
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

function AnalyticsCard({ label, value, styles }: { label: string; value: string | number; styles: ReturnType<typeof createStyles> }) {
  return <View style={styles.analyticsCard}><Text style={styles.analyticsValue}>{value}</Text><Text style={styles.analyticsLabel}>{label}</Text></View>;
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    center: { flex: 1, alignItems: "center", justifyContent: "center" },
    page: { padding: 20, paddingBottom: 34 },
    grid: { flexDirection: "row", gap: 10 },
    metric: { flex: 1, padding: 15, borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.panelRaised },
    label: { color: colors.muted, fontSize: 9, fontWeight: "800", letterSpacing: 1, marginBottom: 7 },
    metricValue: { color: colors.text, fontSize: 20, fontWeight: "800", marginTop: 8 },
    notice: { color: colors.green, fontSize: 11, marginTop: 14 },
    error: { color: colors.danger, fontSize: 11, marginTop: 14 },
    section: { color: colors.text, fontSize: 12, fontWeight: "800", letterSpacing: 1.4, marginTop: 24, marginBottom: 10 },
    analyticsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    analyticsCard: { flexGrow: 1, flexBasis: "30%", minHeight: 62, justifyContent: "center", padding: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.panel },
    analyticsValue: { color: colors.cyan, fontSize: 16, fontWeight: "900" },
    analyticsLabel: { color: colors.muted, fontSize: 9, fontWeight: "800", marginTop: 6 },
    card: { padding: 14, marginBottom: 9, borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.panel },
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
    assignPanel: { marginTop: 12, padding: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.panelRaised },
    employeeChips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    employeeChip: { minHeight: 34, justifyContent: "center", paddingHorizontal: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.panel },
    employeeChipActive: { borderColor: colors.cyan, backgroundColor: colors.activePanel },
    employeeChipText: { color: colors.muted, fontSize: 10, fontWeight: "900" },
    employeeChipTextActive: { color: colors.cyan },
    primary: { flexGrow: 1, flexBasis: 130, alignItems: "center", justifyContent: "center", minHeight: 42, paddingHorizontal: 12, borderRadius: 8, backgroundColor: colors.cyan },
    primaryText: { color: colors.buttonText, fontWeight: "900", fontSize: 10, letterSpacing: 1 },
    action: { flexGrow: 1, flexBasis: 110, alignItems: "center", justifyContent: "center", minHeight: 42, paddingHorizontal: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 8 },
    link: { color: colors.cyan, fontSize: 10, fontWeight: "900", letterSpacing: 1 },
    deleteLink: { color: colors.danger, fontSize: 10, fontWeight: "900", letterSpacing: 1 },
    reschedulePanel: { marginTop: 12, padding: 12, borderWidth: 1, borderColor: colors.heroBorder, borderRadius: 8, backgroundColor: colors.panelRaised },
    cashPanel: { marginTop: 12, padding: 12, borderWidth: 1, borderColor: colors.green, borderRadius: 8, backgroundColor: colors.successPanel },
    closeInfo: { marginTop: 12, padding: 10, borderWidth: 1, borderColor: colors.heroBorder, borderRadius: 8, backgroundColor: colors.panelRaised },
    closeTitle: { color: colors.text, fontSize: 10, fontWeight: "900", letterSpacing: 1 },
    closeText: { color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 6 },
    cashInput: { color: colors.text, minHeight: 70, padding: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.panel, fontSize: 12, textAlignVertical: "top", marginBottom: 10 },
    cashNote: { color: colors.green, fontSize: 10, lineHeight: 15, marginTop: 10 },
    picker: { padding: 12, marginBottom: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.panel },
    value: { color: colors.text, fontSize: 13, fontWeight: "700" },
    empty: { color: colors.muted, fontSize: 12, paddingVertical: 8 },
  });
}
