import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
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
type AnalyticsRange = "DAY" | "WEEK" | "MONTH" | "YEAR";
type BookingSection = "requests" | "scheduled" | "payment" | "history" | null;
type TrendPoint = { label: string; requests: number; completed: number; income: number };

const analyticsRanges: AnalyticsRange[] = ["DAY", "WEEK", "MONTH", "YEAR"];

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
  const [analyticsRange, setAnalyticsRange] = useState<AnalyticsRange>("WEEK");
  const [activeBookingSection, setActiveBookingSection] = useState<BookingSection>(null);

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
      setNotice("Cash payment request successfully sent to client. Booking will close after the client confirms.");
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
  const trendPoints = buildTrendPoints(bookings, paidPayments, analyticsRange);
  const rangeTotals = trendPoints.reduce((totals, point) => ({
    requests: totals.requests + point.requests,
    completed: totals.completed + point.completed,
    income: totals.income + point.income,
  }), { requests: 0, completed: 0, income: 0 });
  const statusDiagram = [
    { label: "Pending", value: requestBookings.length, color: colors.amber },
    { label: "Scheduled", value: scheduledBookings.length, color: colors.cyan },
    { label: "Completed", value: completedCount, color: colors.green },
    { label: "Closed", value: historyBookings.length, color: colors.muted },
  ];

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.cyan} /></View>;

  return (
    <KeyboardAwareScreen contentContainerStyle={styles.page}>
      <ScreenHeader eyebrow="PARTNER CONSOLE // MERCHANT" title="Salon dashboard" subtitle="Track bookings, daily earnings, booking analytics, customers, and request actions." />
      <View style={styles.merchantHero}>
        <View style={styles.heroCopy}>
          <Text style={styles.heroKicker}>HELLO MERCHANT</Text>
          <Text style={styles.heroTitle}>BarberX partner desk</Text>
          <Text style={styles.heroText}>Accept new requests, assign stylists, close services cleanly, and grow your daily salon income.</Text>
        </View>
        <View style={styles.heroArt}>
          <View style={styles.salonBoard}>
            <Ionicons name="storefront-outline" size={24} color={colors.cyan} />
            <View style={styles.boardLineWide} />
            <View style={styles.boardLine} />
          </View>
          <View style={styles.heroScissor}><Ionicons name="cut" size={24} color={colors.buttonText} /></View>
          <View style={styles.heroCalendar}><Ionicons name="calendar-outline" size={18} color={colors.green} /></View>
        </View>
      </View>
      <View style={styles.bannerGrid}>
        <View style={styles.infoBanner}>
          <Ionicons name="notifications-outline" size={24} color={colors.amber} />
          <View style={styles.bannerCopy}>
            <Text style={styles.bannerTitle}>{requestBookings.length} new request(s)</Text>
            <Text style={styles.bannerText}>Respond quickly to improve client confidence and conversion.</Text>
          </View>
        </View>
        <View style={styles.infoBanner}>
          <Ionicons name="cash-outline" size={24} color={colors.green} />
          <View style={styles.bannerCopy}>
            <Text style={styles.bannerTitle}>INR {dailyEarnings} earned today</Text>
            <Text style={styles.bannerText}>Payments close only after online success or client cash confirmation.</Text>
          </View>
        </View>
        <View style={styles.infoBanner}>
          <Ionicons name="people-outline" size={24} color={colors.cyan} />
          <View style={styles.bannerCopy}>
            <Text style={styles.bannerTitle}>{employees.filter((employee) => employee.isActive).length} active stylist(s)</Text>
            <Text style={styles.bannerText}>Assign bookings to available team members from each request card.</Text>
          </View>
        </View>
      </View>
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
      <Text style={styles.section}>VISUAL INSIGHTS</Text>
      <View style={styles.rangeTabs}>
        {analyticsRanges.map((range) => (
          <TouchableOpacity key={range} onPress={() => setAnalyticsRange(range)} style={[styles.rangeTab, analyticsRange === range && styles.rangeTabActive]}>
            <Text style={[styles.rangeText, analyticsRange === range && styles.rangeTextActive]}>{range}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.visualPanel}>
        <View style={styles.visualTop}>
          <View>
            <Text style={styles.visualTitle}>Performance overview</Text>
            <Text style={styles.visualSub}>{analyticsRange.toLowerCase()} representation from live bookings and payments</Text>
          </View>
          <Text style={styles.visualAmount}>INR {rangeTotals.income}</Text>
        </View>
        <View style={styles.visualSummary}>
          <MiniStat styles={styles} label="Requests" value={rangeTotals.requests} />
          <MiniStat styles={styles} label="Completed" value={rangeTotals.completed} />
          <MiniStat styles={styles} label="Income" value={`INR ${rangeTotals.income}`} />
        </View>
        <TrendBars title="Requests vs completed" mode="count" points={trendPoints} styles={styles} colors={colors} />
        <TrendBars title="Income graph" mode="income" points={trendPoints} styles={styles} colors={colors} />
        <StatusDiagram items={statusDiagram} styles={styles} />
      </View>
      <Text style={styles.section}>CUSTOMER STATISTICS</Text>
      <View style={styles.grid}>
        <Metric styles={styles} label="TOTAL CUSTOMERS" value={String(uniqueCustomerIds.size)} />
        <Metric styles={styles} label="REPEAT CUSTOMERS" value={String(repeatCustomers)} />
      </View>
      {!!notice && <Text style={styles.notice}>{notice}</Text>}
      {!!error && <Text style={styles.error}>{error}</Text>}

      <Text style={styles.section}>BOOKING CONTROLS</Text>
      <View style={styles.quickGrid}>
        <OwnerQuickTile icon="notifications-outline" title="New requests" count={requestBookings.length} active={activeBookingSection === "requests"} onPress={() => setActiveBookingSection((current) => current === "requests" ? null : "requests")} styles={styles} colors={colors} />
        <OwnerQuickTile icon="calendar-outline" title="Scheduled bookings" count={scheduledBookings.length} active={activeBookingSection === "scheduled"} onPress={() => setActiveBookingSection((current) => current === "scheduled" ? null : "scheduled")} styles={styles} colors={colors} />
        <OwnerQuickTile icon="card-outline" title="Waiting payment" count={paymentPendingBookings.length} active={activeBookingSection === "payment"} onPress={() => setActiveBookingSection((current) => current === "payment" ? null : "payment")} styles={styles} colors={colors} />
        <OwnerQuickTile icon="archive-outline" title="Closed history" count={historyBookings.length} active={activeBookingSection === "history"} onPress={() => setActiveBookingSection((current) => current === "history" ? null : "history")} styles={styles} colors={colors} />
      </View>

      {activeBookingSection === "requests" && <>
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
      </>}

      {activeBookingSection === "scheduled" && <>
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
      </>}

      {activeBookingSection === "payment" && <>
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
      </>}

      {activeBookingSection === "history" && <>
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
      </>}

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

function OwnerQuickTile({
  icon,
  title,
  count,
  active,
  onPress,
  styles,
  colors,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  title: string;
  count: number;
  active: boolean;
  onPress: () => void;
  styles: ReturnType<typeof createStyles>;
  colors: ThemeColors;
}) {
  return (
    <TouchableOpacity accessibilityRole="button" onPress={onPress} style={[styles.quickTile, active && styles.quickTileActive]}>
      <View style={styles.quickTop}>
        <Ionicons name={icon} size={27} color={active ? colors.cyan : colors.text} />
        <Text style={styles.quickCount}>{count}</Text>
      </View>
      <Text style={styles.quickTitle}>{title}</Text>
      <Ionicons name={active ? "chevron-up" : "chevron-down"} size={18} color={colors.muted} />
    </TouchableOpacity>
  );
}

function MiniStat({ label, value, styles }: { label: string; value: string | number; styles: ReturnType<typeof createStyles> }) {
  return <View style={styles.miniStat}><Text style={styles.miniValue}>{value}</Text><Text style={styles.miniLabel}>{label}</Text></View>;
}

function TrendBars({
  title,
  mode,
  points,
  styles,
  colors,
}: {
  title: string;
  mode: "count" | "income";
  points: TrendPoint[];
  styles: ReturnType<typeof createStyles>;
  colors: ThemeColors;
}) {
  const maxValue = Math.max(1, ...points.map((point) => mode === "income" ? point.income : Math.max(point.requests, point.completed)));
  return (
    <View style={styles.chartBlock}>
      <Text style={styles.chartTitle}>{title}</Text>
      <View style={styles.barChart}>
        {points.map((point, index) => {
          const incomeHeight = Math.max(8, Math.round((point.income / maxValue) * 88));
          const requestHeight = Math.max(8, Math.round((point.requests / maxValue) * 88));
          const completedHeight = Math.max(8, Math.round((point.completed / maxValue) * 88));
          return (
            <View style={styles.barColumn} key={`${point.label}-${index}`}>
              <View style={styles.barStack}>
                {mode === "income" ? (
                  <View style={[styles.incomeBar, { height: incomeHeight }]} />
                ) : (
                  <View style={styles.dualBars}>
                    <View style={[styles.requestBar, { height: requestHeight }]} />
                    <View style={[styles.completedBar, { height: completedHeight }]} />
                  </View>
                )}
              </View>
              <Text style={styles.barLabel}>{point.label}</Text>
            </View>
          );
        })}
      </View>
      <View style={styles.legendRow}>
        {mode === "income" ? <Legend styles={styles} color={colors.green} label="Income" /> : <>
          <Legend styles={styles} color={colors.amber} label="Requests" />
          <Legend styles={styles} color={colors.green} label="Completed" />
        </>}
      </View>
    </View>
  );
}

function Legend({ color, label, styles }: { color: string; label: string; styles: ReturnType<typeof createStyles> }) {
  return <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: color }]} /><Text style={styles.legendText}>{label}</Text></View>;
}

function StatusDiagram({ items, styles }: { items: Array<{ label: string; value: number; color: string }>; styles: ReturnType<typeof createStyles> }) {
  const total = Math.max(1, items.reduce((sum, item) => sum + item.value, 0));
  return (
    <View style={styles.statusPanel}>
      <Text style={styles.chartTitle}>Request status diagram</Text>
      <View style={styles.statusTrack}>
        {items.map((item) => <View key={item.label} style={[styles.statusSegment, { flex: item.value || 0.25, backgroundColor: item.color }]} />)}
      </View>
      <View style={styles.statusList}>
        {items.map((item) => (
          <View style={styles.statusItem} key={item.label}>
            <View style={[styles.legendDot, { backgroundColor: item.color }]} />
            <Text style={styles.statusLabelText}>{item.label}</Text>
            <Text style={styles.statusPercent}>{Math.round((item.value / total) * 100)}%</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function buildTrendPoints(bookings: Booking[], payments: Payment[], range: AnalyticsRange) {
  const descriptors = buildRangeDescriptors(range);
  return descriptors.map((descriptor) => {
    const rangeBookings = bookings.filter((booking) => isInRange(new Date(booking.scheduledAt), descriptor.start, descriptor.end));
    const rangePayments = payments.filter((payment) => payment.status === "PAID" && payment.paidAt && isInRange(new Date(payment.paidAt), descriptor.start, descriptor.end));
    return {
      label: descriptor.label,
      requests: rangeBookings.length,
      completed: rangeBookings.filter((booking) => booking.status === "COMPLETED").length,
      income: rangePayments.reduce((sum, payment) => sum + payment.merchantAmount, 0),
    };
  });
}

function buildRangeDescriptors(range: AnalyticsRange) {
  const now = new Date();
  if (range === "DAY") {
    return Array.from({ length: 6 }, (_, index) => {
      const start = new Date(now);
      start.setHours(Math.max(0, now.getHours() - (5 - index) * 4), 0, 0, 0);
      const end = new Date(start);
      end.setHours(start.getHours() + 4, 0, 0, 0);
      return { label: `${String(start.getHours()).padStart(2, "0")}:00`, start, end };
    });
  }
  if (range === "WEEK") {
    return Array.from({ length: 7 }, (_, index) => {
      const start = startOfDay(addDays(now, index - 6));
      return { label: start.toLocaleDateString("en-IN", { weekday: "short" }), start, end: addDays(start, 1) };
    });
  }
  if (range === "MONTH") {
    return Array.from({ length: 4 }, (_, index) => {
      const start = startOfDay(addDays(now, (index - 3) * 7));
      return { label: `W${index + 1}`, start, end: addDays(start, 7) };
    });
  }
  return Array.from({ length: 12 }, (_, index) => {
    const start = new Date(now.getFullYear(), index, 1);
    const end = new Date(now.getFullYear(), index + 1, 1);
    return { label: start.toLocaleDateString("en-IN", { month: "short" }), start, end };
  });
}

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function isInRange(date: Date, start: Date, end: Date) {
  return date >= start && date < end;
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    center: { flex: 1, alignItems: "center", justifyContent: "center" },
    page: { padding: 20, paddingBottom: 34 },
    merchantHero: { minHeight: 188, flexDirection: "row", alignItems: "center", gap: 12, padding: 16, marginBottom: 12, overflow: "hidden", borderWidth: 1, borderColor: colors.heroBorder, borderRadius: 8, backgroundColor: colors.panelRaised },
    heroCopy: { flex: 1.18 },
    heroKicker: { color: colors.amber, fontSize: 9, fontWeight: "900", letterSpacing: 1.4 },
    heroTitle: { color: colors.text, fontSize: 25, fontWeight: "900", lineHeight: 31, marginTop: 8 },
    heroText: { color: colors.muted, fontSize: 11, fontWeight: "700", lineHeight: 17, marginTop: 9 },
    heroArt: { width: 126, height: 136, justifyContent: "center", alignItems: "center" },
    salonBoard: { width: 96, height: 92, alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.panel },
    boardLineWide: { width: 54, height: 7, borderRadius: 999, backgroundColor: colors.activePanel },
    boardLine: { width: 36, height: 7, borderRadius: 999, backgroundColor: colors.border },
    heroScissor: { position: "absolute", right: 2, top: 7, width: 48, height: 48, alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: colors.panelRaised, borderRadius: 24, backgroundColor: colors.cyan },
    heroCalendar: { position: "absolute", left: 2, bottom: 7, width: 38, height: 38, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.heroBorder, borderRadius: 8, backgroundColor: colors.panel },
    bannerGrid: { gap: 10, marginBottom: 12 },
    infoBanner: { flexDirection: "row", alignItems: "center", gap: 12, padding: 13, borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.panel },
    bannerCopy: { flex: 1 },
    bannerTitle: { color: colors.text, fontSize: 13, fontWeight: "900" },
    bannerText: { color: colors.muted, fontSize: 10, fontWeight: "700", lineHeight: 15, marginTop: 4 },
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
    rangeTabs: { flexDirection: "row", gap: 8, marginBottom: 10 },
    rangeTab: { flex: 1, minHeight: 38, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.panel },
    rangeTabActive: { borderColor: colors.cyan, backgroundColor: colors.activePanel },
    rangeText: { color: colors.muted, fontSize: 10, fontWeight: "900", letterSpacing: 1 },
    rangeTextActive: { color: colors.cyan },
    visualPanel: { padding: 14, borderWidth: 1, borderColor: colors.heroBorder, borderRadius: 8, backgroundColor: colors.panelRaised },
    visualTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10 },
    visualTitle: { color: colors.text, fontSize: 15, fontWeight: "900" },
    visualSub: { color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 5 },
    visualAmount: { color: colors.green, fontSize: 14, fontWeight: "900" },
    visualSummary: { flexDirection: "row", gap: 8, marginTop: 12 },
    miniStat: { flex: 1, minHeight: 58, justifyContent: "center", padding: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.panel },
    miniValue: { color: colors.text, fontSize: 13, fontWeight: "900" },
    miniLabel: { color: colors.muted, fontSize: 9, fontWeight: "800", marginTop: 6 },
    quickGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
    quickTile: { flexGrow: 1, flexBasis: "47%", minHeight: 116, justifyContent: "space-between", padding: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.panelRaised },
    quickTileActive: { borderColor: colors.cyan, backgroundColor: colors.activePanel },
    quickTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    quickCount: { color: colors.cyan, fontSize: 17, fontWeight: "900" },
    quickTitle: { color: colors.text, fontSize: 15, fontWeight: "900", lineHeight: 20 },
    chartBlock: { marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border },
    chartTitle: { color: colors.text, fontSize: 12, fontWeight: "900", letterSpacing: 0.8 },
    barChart: { minHeight: 134, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 7, marginTop: 12 },
    barColumn: { flex: 1, alignItems: "center", justifyContent: "flex-end" },
    barStack: { height: 96, width: "100%", alignItems: "center", justifyContent: "flex-end" },
    dualBars: { height: "100%", flexDirection: "row", alignItems: "flex-end", justifyContent: "center", gap: 4 },
    requestBar: { width: 8, borderTopLeftRadius: 8, borderTopRightRadius: 8, backgroundColor: colors.amber },
    completedBar: { width: 8, borderTopLeftRadius: 8, borderTopRightRadius: 8, backgroundColor: colors.green },
    incomeBar: { width: 18, borderTopLeftRadius: 8, borderTopRightRadius: 8, backgroundColor: colors.green },
    barLabel: { color: colors.muted, fontSize: 8, fontWeight: "900", marginTop: 8 },
    legendRow: { flexDirection: "row", gap: 14, marginTop: 8 },
    legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
    legendDot: { width: 8, height: 8, borderRadius: 4 },
    legendText: { color: colors.muted, fontSize: 9, fontWeight: "800" },
    statusPanel: { marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border },
    statusTrack: { height: 14, flexDirection: "row", overflow: "hidden", marginTop: 12, borderRadius: 999, backgroundColor: colors.border },
    statusSegment: { height: "100%" },
    statusList: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
    statusItem: { flexBasis: "48%", flexDirection: "row", alignItems: "center", gap: 7 },
    statusLabelText: { flex: 1, color: colors.muted, fontSize: 10, fontWeight: "800" },
    statusPercent: { color: colors.text, fontSize: 10, fontWeight: "900" },
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
