import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Linking, NativeModules, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { apiRequest } from "../../api/client";
import { ThemeColors, useTheme } from "../../utils/theme";
import { useBackHandler } from "../../hooks/useBackHandler";
import { KeyboardAwareScreen } from "../common/KeyboardAwareScreen";
import { ScreenHeader } from "../common/ScreenHeader";

type Booking = {
  id: string;
  scheduledAt: string;
  address: string;
  totalAmount: number;
  status: string;
  salon?: { name: string };
  client?: { name?: string | null; phone: string; email?: string | null };
  service?: { name: string };
  services?: Array<{ service: { name: string }; price: number }>;
  payment?: Payment | null;
  review?: Review | null;
};

type Review = {
  id: string;
  rating: number;
  comment?: string | null;
};

type Payment = {
  id: string;
  amount: number;
  currency: string;
  status: string;
  method?: string | null;
  platformFee: number;
  merchantAmount: number;
  commissionRate: number;
  invoiceNumber?: string | null;
  paidAt?: string | null;
  razorpayOrder?: string | null;
  razorpayPayment?: string | null;
  cashRemark?: string | null;
  booking?: Booking;
};

type PaymentOrderResponse = {
  keyId: string;
  order: { id: string; amount: number; currency: string };
  payment: Payment;
};

export function MyBookingsScreen({ token }: { token: string }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
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
  const [reviewingBookingId, setReviewingBookingId] = useState<string | null>(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");

  useBackHandler(() => {
    if (reschedulingBookingId) {
      setReschedulingBookingId(null);
      return true;
    }
    if (reviewingBookingId) {
      setReviewingBookingId(null);
      return true;
    }
    return false;
  });

  useEffect(() => {
    void loadBookings();
  }, []);

  async function loadBookings() {
    setLoading(true);
    setError("");
    try {
      setBookings(await apiRequest<Booking[]>("/bookings", { headers: { Authorization: `Bearer ${token}` } }));
      setPayments(await apiRequest<Payment[]>("/payments", { headers: { Authorization: `Bearer ${token}` } }));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load bookings");
    } finally {
      setLoading(false);
    }
  }

  async function payForBooking(booking: Booking) {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const paymentOrder = await apiRequest<PaymentOrderResponse>("/payments/order", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ bookingId: booking.id }),
      });

      if (!NativeModules.RazorpayCheckout) {
        // Fallback for Expo Go or when Razorpay native checkout is not linked
        const webUrl = `https://api.razorpay.com/v1/checkout/hosted?key_id=${paymentOrder.keyId}&order_id=${paymentOrder.order.id}&prefill[name]=${encodeURIComponent(booking.client?.name || "")}&prefill[email]=${encodeURIComponent(booking.client?.email || "")}&prefill[contact]=${encodeURIComponent(booking.client?.phone || "")}`;
        await Linking.openURL(webUrl);

        Alert.alert(
          "Payment Opened",
          "We have opened the payment gateway in your browser. Complete the payment in the browser, then tap 'Verify Payment' below.",
          [
            {
              text: "Cancel",
              style: "cancel",
            },
            {
              text: "Verify Payment",
              onPress: async () => {
                setSaving(true);
                setError("");
                try {
                  const statusRes = await apiRequest<Payment>("/payments/check-order-status", {
                    method: "POST",
                    headers: { Authorization: `Bearer ${token}` },
                    body: JSON.stringify({ bookingId: booking.id }),
                  });
                  if (statusRes.status === "PAID") {
                    setNotice("Payment successful. Invoice generated.");
                    await loadBookings();
                  } else {
                    setError("We could not verify your payment yet. Please complete the payment in the browser and try again.");
                  }
                } catch (verifyError) {
                  setError(verifyError instanceof Error ? verifyError.message : "Verification failed");
                } finally {
                  setSaving(false);
                }
              }
            }
          ]
        );
        return;
      }

      const RazorpayCheckout = (await import("react-native-razorpay")).default;
      if (!RazorpayCheckout?.open) {
        throw new Error("Razorpay checkout is not linked in this app build. Rebuild the native app and try again.");
      }
      const result = await RazorpayCheckout.open({
        key: paymentOrder.keyId,
        amount: paymentOrder.order.amount,
        currency: paymentOrder.order.currency,
        name: "Salon At Home",
        description: serviceNames(booking),
        order_id: paymentOrder.order.id,
        prefill: {
          name: booking.client?.name,
          email: booking.client?.email,
          contact: booking.client?.phone,
        },
        theme: { color: colors.cyan },
      });
      await apiRequest<Payment>("/payments/verify", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          bookingId: booking.id,
          razorpayOrderId: result.razorpay_order_id,
          razorpayPaymentId: result.razorpay_payment_id,
          razorpaySignature: result.razorpay_signature,
        }),
      });
      setNotice("Payment successful. Invoice generated.");
      await loadBookings();
    } catch (paymentError) {
      setError(paymentError instanceof Error ? paymentError.message : "Could not complete payment");
    } finally {
      setSaving(false);
    }
  }

  async function showInvoice(paymentId: string) {
    setError("");
    try {
      const invoice = await apiRequest<Payment>(`/payments/${paymentId}/invoice`, { headers: { Authorization: `Bearer ${token}` } });
      Alert.alert(
        "Digital invoice",
        [
          `Invoice: ${invoice.invoiceNumber ?? "Pending"}`,
          `Closed by: ${invoice.method ?? "ONLINE"}`,
          `Amount: INR ${invoice.amount}`,
          `Admin brokerage: INR ${invoice.platformFee}`,
          `Merchant amount: INR ${invoice.merchantAmount}`,
          invoice.cashRemark ? `Cash remark: ${invoice.cashRemark}` : "",
          `Razorpay payment: ${invoice.razorpayPayment ?? "N/A"}`,
        ].filter(Boolean).join("\n"),
      );
    } catch (invoiceError) {
      setError(invoiceError instanceof Error ? invoiceError.message : "Could not load invoice");
    }
  }

  async function confirmCashPayment(booking: Booking) {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await apiRequest<Payment>("/payments/cash/confirm", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ bookingId: booking.id }),
      });
      setNotice("Cash payment confirmed. Booking closed.");
      await loadBookings();
    } catch (cashError) {
      setError(cashError instanceof Error ? cashError.message : "Could not confirm cash payment");
    } finally {
      setSaving(false);
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

  function startReview(booking: Booking) {
    setReviewingBookingId(booking.id);
    setReviewRating(5);
    setReviewComment("");
  }

  async function submitReview(id: string) {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await apiRequest<Review>("/reviews", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ bookingId: id, rating: reviewRating, comment: reviewComment.trim() || undefined }),
      });
      setReviewingBookingId(null);
      setReviewComment("");
      setNotice("Review submitted");
      await loadBookings();
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : "Could not submit review");
    } finally {
      setSaving(false);
    }
  }

  const upcoming = bookings.filter((booking) => ["PENDING", "ACCEPTED"].includes(booking.status) && new Date(booking.scheduledAt) >= new Date());
  const awaitingPayment = bookings.filter((booking) => booking.status === "PAYMENT_PENDING");
  const completed = bookings.filter((booking) => !upcoming.some((item) => item.id === booking.id) && booking.status !== "PAYMENT_PENDING");
  const paidPayments = payments.filter((payment) => payment.status === "PAID");

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.cyan} /></View>;

  return (
    <KeyboardAwareScreen contentContainerStyle={styles.page}>
      <ScreenHeader eyebrow="BOOKINGS // CLIENT" title="My bookings" subtitle="Track upcoming bookings, reschedule visits, and review completed service history." />
      {!!notice && <Text style={styles.notice}>{notice}</Text>}
      {!!error && <Text style={styles.error}>{error}</Text>}

      <View style={styles.summaryGrid}>
        <BookingMetric styles={styles} icon="calendar-outline" label="Upcoming" value={String(upcoming.length)} />
        <BookingMetric styles={styles} icon="card-outline" label="Pay now" value={String(awaitingPayment.length)} />
        <BookingMetric styles={styles} icon="receipt-outline" label="Invoices" value={String(paidPayments.length)} />
      </View>

      <SectionTitle styles={styles} title="Upcoming" count={upcoming.length} />
      {upcoming.length ? upcoming.map((booking) => <BookingCard booking={booking} key={booking.id} styles={styles} saving={saving} onCancel={cancelBooking} onStartReschedule={startReschedule} reschedulingBookingId={reschedulingBookingId} rescheduleDate={rescheduleDate} rescheduleTime={rescheduleTime} setShowDatePicker={setShowDatePicker} setShowTimePicker={setShowTimePicker} onSubmitReschedule={submitReschedule} onPay={payForBooking} onConfirmCash={confirmCashPayment} onInvoice={showInvoice} />) : <Text style={styles.empty}>No upcoming bookings.</Text>}

      {showDatePicker && <DateTimePicker value={rescheduleDateValue ?? new Date()} mode="date" minimumDate={new Date()} display="default" onChange={updateDate} />}
      {showTimePicker && <DateTimePicker value={rescheduleTimeValue ?? new Date()} mode="time" display="default" onChange={updateTime} />}

      <SectionTitle styles={styles} title="Awaiting payment" count={awaitingPayment.length} />
      {awaitingPayment.length ? awaitingPayment.map((booking) => <BookingCard booking={booking} key={booking.id} styles={styles} saving={saving} onPay={payForBooking} onConfirmCash={confirmCashPayment} onInvoice={showInvoice} />) : <Text style={styles.empty}>No payment requests right now.</Text>}

      <SectionTitle styles={styles} title="History" count={completed.length} />
      {completed.length ? completed.map((booking) => <BookingCard booking={booking} key={booking.id} styles={styles} saving={saving} onPay={payForBooking} onInvoice={showInvoice} onStartReview={startReview} onSubmitReview={submitReview} reviewingBookingId={reviewingBookingId} reviewRating={reviewRating} reviewComment={reviewComment} setReviewRating={setReviewRating} setReviewComment={setReviewComment} />) : <Text style={styles.empty}>No completed bookings yet.</Text>}

      <SectionTitle styles={styles} title="Payment history" count={payments.length} />
      {payments.length ? payments.map((payment) => (
        <View style={styles.paymentCard} key={payment.id}>
          <View>
            <Text style={styles.bookingTitle}>{payment.invoiceNumber ?? payment.id.slice(0, 8).toUpperCase()}</Text>
            <Text style={styles.bookingMeta}>{payment.booking?.salon?.name ?? "Salon"} | {payment.paidAt ? new Date(payment.paidAt).toLocaleString() : payment.status}</Text>
            <Text style={styles.bookingMeta}>Closed by: {payment.method ?? "ONLINE"}</Text>
            <Text style={styles.bookingMeta}>Admin brokerage {payment.commissionRate}%: INR {payment.platformFee}</Text>
            {payment.cashRemark ? <Text style={styles.bookingMeta}>Cash remark: {payment.cashRemark}</Text> : null}
          </View>
          <View style={styles.bookingSide}>
            <Text style={styles.bookingStatus}>{payment.status}</Text>
            <Text style={styles.bookingAmount}>INR {payment.amount}</Text>
            {payment.status === "PAID" && <TouchableOpacity onPress={() => void showInvoice(payment.id)}><Text style={styles.link}>INVOICE</Text></TouchableOpacity>}
          </View>
        </View>
      )) : <Text style={styles.empty}>No payments yet. Payment opens after service completion.</Text>}
    </KeyboardAwareScreen>
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
  onPay,
  onConfirmCash,
  onInvoice,
  onStartReview,
  onSubmitReview,
  reviewingBookingId,
  reviewRating,
  reviewComment,
  setReviewRating,
  setReviewComment,
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
  onPay?: (booking: Booking) => Promise<void>;
  onConfirmCash?: (booking: Booking) => Promise<void>;
  onInvoice?: (paymentId: string) => Promise<void>;
  onStartReview?: (booking: Booking) => void;
  onSubmitReview?: (id: string) => Promise<void>;
  reviewingBookingId?: string | null;
  reviewRating?: number;
  reviewComment?: string;
  setReviewRating?: (rating: number) => void;
  setReviewComment?: (comment: string) => void;
}) {
  const canManage = ["PENDING", "ACCEPTED"].includes(booking.status) && !!onCancel && !!onStartReschedule;
  const canPay = booking.status === "PAYMENT_PENDING" && booking.payment?.status !== "PAID" && booking.payment?.method !== "CASH" && !!onPay;
  const canConfirmCash = booking.payment?.method === "CASH" && booking.payment.status === "CREATED" && !!onConfirmCash;
  const canViewInvoice = booking.payment?.status === "PAID" && !!booking.payment.id && !!onInvoice;
  const canReview = booking.status === "COMPLETED" && !booking.review && !!onStartReview;
  const isRescheduling = reschedulingBookingId === booking.id;
  const isReviewing = reviewingBookingId === booking.id;

  return (
    <View style={styles.bookingCard}>
      <View style={styles.bookingTop}>
        <View style={styles.bookingCopy}>
          <Text style={styles.bookingTitle}>{serviceNames(booking)}</Text>
          <View style={styles.metaRow}><Ionicons name="storefront-outline" size={13} color={styles.placeholder.color} /><Text style={styles.bookingMeta}>{booking.salon?.name ?? "Salon"}</Text></View>
          <View style={styles.metaRow}><Ionicons name="time-outline" size={13} color={styles.placeholder.color} /><Text style={styles.bookingMeta}>{new Date(booking.scheduledAt).toLocaleString()}</Text></View>
          <View style={styles.metaRow}><Ionicons name="location-outline" size={13} color={styles.placeholder.color} /><Text style={styles.bookingMeta}>{booking.address}</Text></View>
          {booking.status === "PAYMENT_PENDING" && booking.payment?.status !== "PAID" && booking.payment?.method !== "CASH" && <Text style={styles.payHint}>Service finished. Pay online to close this booking.</Text>}
          {canConfirmCash && <Text style={styles.payHint}>Merchant requested cash closure. Confirm only after you paid.</Text>}
        </View>
        <View style={styles.bookingSide}>
          <Text style={[styles.bookingStatus, statusStyle(booking.status, styles)]}>{statusLabel(booking.status)}</Text>
          <Text style={styles.bookingAmount}>INR {booking.totalAmount}</Text>
          {booking.payment?.status === "PAID" && <Text style={styles.paid}>{booking.payment.method ?? "PAID"}</Text>}
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
      {canPay && <TouchableOpacity disabled={saving} onPress={() => void onPay?.(booking)} style={styles.payButton}><Text style={styles.primaryText}>PAY NOW</Text></TouchableOpacity>}
      {canConfirmCash && <TouchableOpacity disabled={saving} onPress={() => Alert.alert("Confirm cash payment?", "Confirm only if you paid cash to the merchant.", [{ text: "Cancel" }, { text: "Confirm", onPress: () => void onConfirmCash?.(booking) }])} style={styles.payButton}><Text style={styles.primaryText}>CONFIRM CASH PAID</Text></TouchableOpacity>}
      {canViewInvoice && <TouchableOpacity onPress={() => void onInvoice?.(booking.payment!.id)} style={styles.invoiceButton}><Text style={styles.link}>VIEW DIGITAL INVOICE</Text></TouchableOpacity>}
      {!!booking.review && <Text style={styles.reviewDone}>Your rating: {"★".repeat(booking.review.rating)}{"☆".repeat(5 - booking.review.rating)}</Text>}
      {canReview && !isReviewing && <TouchableOpacity disabled={saving} onPress={() => onStartReview?.(booking)} style={styles.invoiceButton}><Text style={styles.link}>RATE SALON</Text></TouchableOpacity>}
      {isReviewing && <View style={styles.reviewPanel}>
        <Text style={styles.label}>RATE SALON</Text>
        <View style={styles.starRow}>
          {[1, 2, 3, 4, 5].map((rating) => (
            <TouchableOpacity key={rating} onPress={() => setReviewRating?.(rating)} style={styles.starButton}>
              <Text style={rating <= (reviewRating ?? 5) ? styles.starActive : styles.starInactive}>★</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TextInput value={reviewComment} onChangeText={setReviewComment} placeholder="Write your review" placeholderTextColor={styles.placeholder.color} style={styles.reviewInput} multiline />
        <TouchableOpacity disabled={saving} onPress={() => void onSubmitReview?.(booking.id)} style={styles.primary}><Text style={styles.primaryText}>SUBMIT REVIEW</Text></TouchableOpacity>
      </View>}
    </View>
  );
}

function BookingMetric({ icon, label, value, styles }: { icon: React.ComponentProps<typeof Ionicons>["name"]; label: string; value: string; styles: ReturnType<typeof createStyles> }) {
  return <View style={styles.metricCard}><Ionicons name={icon} size={18} color={styles.placeholder.color} /><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>;
}

function SectionTitle({ title, count, styles }: { title: string; count: number; styles: ReturnType<typeof createStyles> }) {
  return <View style={styles.sectionRow}><Text style={styles.section}>{title.toUpperCase()}</Text><Text style={styles.countBadge}>{count}</Text></View>;
}

function statusLabel(status: string) {
  if (status === "PAYMENT_PENDING") return "PAY NOW";
  return status;
}

function statusStyle(status: string, styles: ReturnType<typeof createStyles>) {
  if (status === "ACCEPTED") return styles.statusAccepted;
  if (status === "PAYMENT_PENDING") return styles.statusPay;
  if (status === "COMPLETED") return styles.statusDone;
  if (["CANCELLED", "REJECTED"].includes(status)) return styles.statusBad;
  return styles.statusPending;
}

function serviceNames(booking: Booking) {
  return booking.services?.length ? booking.services.map((item) => item.service.name).join(", ") : booking.service?.name ?? "Salon service";
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    center: { flex: 1, alignItems: "center", justifyContent: "center" },
    page: { padding: 20, paddingBottom: 34 },
    section: { color: colors.text, fontSize: 12, fontWeight: "800", letterSpacing: 1.4, marginTop: 22, marginBottom: 10 },
    notice: { color: colors.green, fontSize: 11, marginBottom: 8 },
    error: { color: colors.danger, fontSize: 11, marginBottom: 8 },
    empty: { color: colors.muted, fontSize: 12, paddingVertical: 8 },
    summaryGrid: { flexDirection: "row", gap: 8, marginBottom: 12 },
    metricCard: { flex: 1, minHeight: 82, alignItems: "flex-start", justifyContent: "center", padding: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.panelRaised },
    metricValue: { color: colors.text, fontSize: 20, fontWeight: "900", marginTop: 7 },
    metricLabel: { color: colors.muted, fontSize: 9, fontWeight: "900", marginTop: 4 },
    sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 22, marginBottom: 10 },
    countBadge: { minWidth: 28, textAlign: "center", color: colors.cyan, fontSize: 11, fontWeight: "900", paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: colors.cyan, borderRadius: 999 },
    bookingCard: { padding: 14, marginBottom: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.panel },
    bookingTop: { flexDirection: "row", justifyContent: "space-between", gap: 10 },
    bookingCopy: { flex: 1 },
    bookingTitle: { color: colors.text, fontSize: 15, fontWeight: "900", marginBottom: 6 },
    metaRow: { flexDirection: "row", alignItems: "flex-start", gap: 6, marginTop: 5 },
    bookingMeta: { flex: 1, color: colors.muted, fontSize: 10, lineHeight: 15 },
    bookingSide: { alignItems: "flex-end" },
    bookingStatus: { overflow: "hidden", color: colors.amber, fontSize: 9, fontWeight: "900", paddingHorizontal: 8, paddingVertical: 5, borderRadius: 999 },
    statusPending: { color: colors.amber, backgroundColor: colors.warningPanel },
    statusAccepted: { color: colors.cyan, backgroundColor: colors.activePanel },
    statusPay: { color: colors.buttonText, backgroundColor: colors.cyan },
    statusDone: { color: colors.green, backgroundColor: colors.successPanel },
    statusBad: { color: colors.danger, backgroundColor: colors.dangerPanel },
    bookingAmount: { color: colors.cyan, fontSize: 11, fontWeight: "800", marginTop: 8 },
    paid: { color: colors.green, fontSize: 9, fontWeight: "900", marginTop: 8 },
    payHint: { color: colors.green, fontSize: 10, fontWeight: "800", marginTop: 8 },
    bookingActions: { flexDirection: "row", gap: 10, marginTop: 12 },
    bookingAction: { flex: 1, alignItems: "center", padding: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 8 },
    link: { color: colors.cyan, fontSize: 10, fontWeight: "900", letterSpacing: 1 },
    deleteLink: { color: colors.danger, fontSize: 10, fontWeight: "900", letterSpacing: 1 },
    reschedulePanel: { marginTop: 12, padding: 12, borderWidth: 1, borderColor: colors.heroBorder, borderRadius: 8, backgroundColor: colors.panelRaised },
    reschedulePicker: { padding: 12, marginBottom: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.panel },
    label: { color: colors.muted, fontSize: 9, fontWeight: "800", letterSpacing: 1, marginBottom: 7 },
    value: { color: colors.text, fontSize: 13, fontWeight: "700" },
    primary: { alignItems: "center", justifyContent: "center", minHeight: 44, marginTop: 2, padding: 12, borderRadius: 8, backgroundColor: colors.cyan },
    primaryText: { color: colors.buttonText, fontWeight: "900", fontSize: 10, letterSpacing: 1.2 },
    payButton: { alignItems: "center", justifyContent: "center", minHeight: 44, marginTop: 12, padding: 12, borderRadius: 8, backgroundColor: colors.cyan },
    invoiceButton: { alignItems: "center", justifyContent: "center", minHeight: 42, marginTop: 12, padding: 12, borderWidth: 1, borderColor: colors.cyan, borderRadius: 8 },
    paymentCard: { flexDirection: "row", justifyContent: "space-between", gap: 10, padding: 14, marginBottom: 9, borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.panel },
    reviewDone: { color: colors.amber, fontSize: 11, fontWeight: "900", marginTop: 12 },
    reviewPanel: { marginTop: 12, padding: 12, borderWidth: 1, borderColor: colors.heroBorder, borderRadius: 8, backgroundColor: colors.panelRaised },
    starRow: { flexDirection: "row", gap: 6, marginBottom: 10 },
    starButton: { width: 34, height: 34, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.panel },
    starActive: { color: colors.amber, fontSize: 20, fontWeight: "900" },
    starInactive: { color: colors.muted, fontSize: 20, fontWeight: "900" },
    reviewInput: { color: colors.text, minHeight: 82, padding: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.panel, fontSize: 12, textAlignVertical: "top", marginBottom: 10 },
    placeholder: { color: colors.placeholder },
  });
}
