import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Image, ScrollView, Share, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SessionUser } from "../../App";
import { API_URL, WS_ORIGIN, apiAssetUrl, apiRequest } from "../../api/client";
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
type SupportMessage = { id: string; body: string; createdAt: string; sender: { id: string; name?: string | null; role: string } };
type SupportTicket = {
  id: string;
  subject: string;
  status: "PENDING" | "ACCEPTED" | "CLOSED";
  messages: SupportMessage[];
  client?: { id: string; name?: string | null; phone: string; email?: string | null };
  admin?: { id?: string; name?: string | null } | null;
};
type MembershipPlan = {
  code: string;
  name: string;
  monthlyPrice: number;
  servicesPerMonth: number;
  description: string;
  benefits: string[];
};
type ActiveMembership = {
  id: string;
  expiresAt: string;
  remainingServices: number;
  plan: MembershipPlan;
};

const emptyAddress = { label: "", line1: "", line2: "", city: "", state: "", pincode: "", isDefault: false };
type ProfileSection = "profile" | "address" | "membership" | "support" | "about" | "privacy" | "terms" | "safety" | "ticket" | null;

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
  const [activeSection, setActiveSection] = useState<ProfileSection>(null);
  const [supportMessage, setSupportMessage] = useState("");
  const [supportSubject, setSupportSubject] = useState("");
  const [supportTickets, setSupportTickets] = useState<SupportTicket[]>([]);
  const [activeTicketId, setActiveTicketId] = useState<string | null>(null);
  const [chatMessage, setChatMessage] = useState("");
  const [membershipPlans, setMembershipPlans] = useState<MembershipPlan[]>([]);
  const [activeMembership, setActiveMembership] = useState<ActiveMembership | null>(null);
  const [safetyMessage, setSafetyMessage] = useState("");
  const [safetySuccess, setSafetySuccess] = useState("");
  const [ticketSubject, setTicketSubject] = useState("");
  const [ticketMessage, setTicketMessage] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const wsRef = useRef<WebSocket | null>(null);
  const screenRef = useRef<ScrollView>(null);
  const supportPanelY = useRef(0);

  useEffect(() => {
    void loadProfile();
    void loadSupportTickets();
    void loadMembership();
  }, []);

  useEffect(() => {
    const socket = new WebSocket(`${WS_ORIGIN}/ws/support?token=${encodeURIComponent(token)}`);
    wsRef.current = socket;
    socket.onmessage = (event) => {
      const payload = JSON.parse(event.data) as { type?: string; ticketId?: string; message?: SupportMessage; ticket?: SupportTicket };
      if (payload.type === "message" && payload.ticketId && payload.message) {
        setSupportTickets((current) => current.map((ticket) => ticket.id === payload.ticketId
          ? { ...ticket, messages: ticket.messages.some((item) => item.id === payload.message!.id) ? ticket.messages : [...ticket.messages, payload.message!] }
          : ticket));
      }
      if (payload.type === "ticket" && payload.ticket) {
        setSupportTickets((current) => {
          const exists = current.some((ticket) => ticket.id === payload.ticket!.id);
          return exists ? current.map((ticket) => ticket.id === payload.ticket!.id ? payload.ticket! : ticket) : [payload.ticket!, ...current];
        });
      }
    };
    return () => {
      socket.close();
      wsRef.current = null;
    };
  }, [token]);

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

  async function loadSupportTickets() {
    const tickets = await apiRequest<SupportTicket[]>("/support/tickets", { headers: { Authorization: `Bearer ${token}` } }).catch(() => []);
    setSupportTickets(tickets);
    if (!activeTicketId && tickets[0]) {
      setActiveTicketId(tickets[0].id);
      wsRef.current?.send(JSON.stringify({ type: "join", ticketId: tickets[0].id }));
    }
  }

  async function loadMembership() {
    const membership = await apiRequest<{ plans: MembershipPlan[]; activeMembership: ActiveMembership | null }>("/profile/membership", { headers: { Authorization: `Bearer ${token}` } }).catch(() => null);
    setMembershipPlans(membership?.plans ?? []);
    setActiveMembership(membership?.activeMembership ?? null);
  }

  async function subscribeMembership(planCode: string) {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const membership = await apiRequest<ActiveMembership>("/profile/membership/subscribe", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ planCode }),
      });
      setActiveMembership(membership);
      setNotice("Membership package activated");
    } catch (membershipError) {
      setError(membershipError instanceof Error ? membershipError.message : "Could not activate membership");
    } finally {
      setSaving(false);
    }
  }

  async function shareReferral() {
    setError("");
    setNotice("");
    try {
      await Share.share({
        message: `Try Salon At Home for trusted salon services at home. Use my referral code: ${profile?.referralCode ?? user.referralCode ?? "OPENAPP"}`,
      });
      setNotice("Referral shared");
    } catch (shareError) {
      setError(shareError instanceof Error ? shareError.message : "Could not share referral");
    }
  }

  function submitSupportMessage() {
    void createSupportTicket();
  }

  async function createSupportTicket() {
    if (!supportSubject.trim() || !supportMessage.trim()) {
      setError("Write your support message before sending.");
      return;
    }
    setSaving(true);
    try {
      const ticket = await apiRequest<SupportTicket>("/support/tickets", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ subject: supportSubject, message: supportMessage }),
      });
      setSupportTickets((current) => [ticket, ...current]);
      setActiveTicketId(ticket.id);
      wsRef.current?.send(JSON.stringify({ type: "join", ticketId: ticket.id }));
      setSupportSubject("");
      setSupportMessage("");
      setError("");
      setNotice("Ticket raised. Chat starts after admin accepts.");
    } catch (supportError) {
      setError(supportError instanceof Error ? supportError.message : "Could not raise ticket");
    } finally {
      setSaving(false);
    }
  }

  async function sendChatMessage(ticketId: string) {
    if (!chatMessage.trim()) return;
    const body = chatMessage.trim();
    setChatMessage("");
    try {
      const message = await apiRequest<SupportMessage>(`/support/tickets/${ticketId}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ body }),
      });
      setSupportTickets((current) => current.map((ticket) => ticket.id === ticketId ? { ...ticket, messages: ticket.messages.some((item) => item.id === message.id) ? ticket.messages : [...ticket.messages, message] } : ticket));
    } catch (chatError) {
      setError(chatError instanceof Error ? chatError.message : "Could not send message");
    }
  }

  async function acceptSupportTicket(ticketId: string) {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const ticket = await apiRequest<SupportTicket>(`/support/tickets/${ticketId}/accept`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      setSupportTickets((current) => current.map((item) => item.id === ticket.id ? ticket : item));
      setActiveTicketId(ticket.id);
      wsRef.current?.send(JSON.stringify({ type: "join", ticketId: ticket.id }));
      setNotice("Support request accepted. Chat started.");
    } catch (acceptError) {
      setError(acceptError instanceof Error ? acceptError.message : "Could not accept support request");
    } finally {
      setSaving(false);
    }
  }

  async function submitSafetyIssue() {
    if (!safetyMessage.trim()) {
      setError("Describe the safety issue before reporting.");
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    setSafetySuccess("");
    try {
      await apiRequest("/profile/safety-issue", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ message: safetyMessage }),
      });
      setSafetyMessage("");
      setSafetySuccess("Safety issue reported successfully.");
      setNotice("Safety issue sent directly to support email.");
    } catch (safetyError) {
      setError(safetyError instanceof Error ? safetyError.message : "Could not send safety issue");
    } finally {
      setSaving(false);
    }
  }

  function submitTicket() {
    if (!ticketSubject.trim() || !ticketMessage.trim()) {
      setError("Add ticket subject and message before submitting.");
      return;
    }
    setTicketSubject("");
    setTicketMessage("");
    setError("");
    setNotice("Ticket raised");
  }

  function toggleSection(section: Exclude<ProfileSection, null>) {
    setActiveSection((current) => current === section ? null : section);
    setError("");
    setNotice("");
    if (section === "support") void loadSupportTickets();
    if (section === "membership") void loadMembership();
  }

  function openSupportSection() {
    toggleSection("support");
    window.setTimeout(() => {
      screenRef.current?.scrollTo({ y: Math.max(0, supportPanelY.current - 18), animated: true });
    }, 120);
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
    <KeyboardAwareScreen scrollRef={screenRef} contentContainerStyle={styles.page}>
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
            <Text style={styles.referral}>REFERRAL ID: {profile?.referralCode ?? user.referralCode ?? "------"}</Text>
            <Text style={styles.role}>{displayRole} ACCOUNT</Text>
          </View>
        </View>

        {!!notice && <Text style={styles.notice}>{notice}</Text>}
        {!!error && <Text style={styles.error}>{error}</Text>}

        <View style={styles.quickGrid}>
          <QuickTile icon="calendar-number-outline" title="My bookings" onPress={onOpenBookings} />
          <QuickTile icon="gift-outline" title="Refer And Earn" onPress={() => void shareReferral()} />
          <QuickTile icon="headset-outline" title="Help & support" onPress={openSupportSection} />
        </View>

        <View style={styles.menu}>
          <MenuRow icon="person-circle-outline" title="My Profile" onPress={() => toggleSection("profile")} active={activeSection === "profile"} />
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

          <MenuRow icon="diamond-outline" title="My Membership Plan" onPress={() => toggleSection("membership")} active={activeSection === "membership"} />
          {activeSection === "membership" && (
            <View style={styles.inlinePanel}>
              {activeMembership ? (
                <View style={styles.membershipActive}>
                  <Text style={styles.panelTitle}>{activeMembership.plan.name}</Text>
                  <Text style={styles.panelText}>Remaining services: {activeMembership.remainingServices}</Text>
                  <Text style={styles.panelText}>Valid until: {new Date(activeMembership.expiresAt).toLocaleDateString()}</Text>
                </View>
              ) : <Text style={styles.empty}>No active membership package.</Text>}
              {membershipPlans.map((plan) => (
                <View style={styles.planCard} key={plan.code}>
                  <View style={styles.planTop}>
                    <View style={styles.ticketCopy}>
                      <Text style={styles.planName}>{plan.name}</Text>
                      <Text style={styles.panelText}>{plan.description}</Text>
                    </View>
                    <Text style={styles.planPrice}>INR {plan.monthlyPrice}/mo</Text>
                  </View>
                  <Text style={styles.planServices}>{plan.servicesPerMonth} services per month</Text>
                  {plan.benefits.map((benefit) => <Text style={styles.benefit} key={benefit}>+ {benefit}</Text>)}
                  <TouchableOpacity disabled={saving || activeMembership?.plan.code === plan.code} onPress={() => void subscribeMembership(plan.code)} style={styles.primary}>
                    <Text style={styles.primaryText}>{activeMembership?.plan.code === plan.code ? "ACTIVE" : "ACTIVATE"}</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
          <MenuRow icon="location-outline" title="Manage Address" onPress={() => toggleSection("address")} active={activeSection === "address"} />
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
          <MenuRow icon="information-circle-outline" title="About App" onPress={() => toggleSection("about")} active={activeSection === "about"} />
          {activeSection === "about" && <InfoPanel title="Salon At Home" points={[
            "Book trusted salon services at home from nearby approved salons.",
            "Search salons by location, services, rating, price, and distance.",
            "Choose multiple services, preferred date, time, address, and booking instructions.",
            "Track booking requests, accepted bookings, reschedules, cancellations, and completed services.",
            "Pay only after service completion through online payment or confirmed cash collection.",
            "Receive digital invoices, payment history, booking notifications, and service updates.",
            "Salon owners can manage salon details, services, employees, bookings, earnings, and commissions.",
            "Admins can approve salons, monitor bookings, manage payments, resolve disputes, and support users.",
            "Live Help & support lets users raise tickets and chat with admin in real time.",
            "Safety reporting helps users report urgent service or platform concerns.",
          ]} styles={styles} />}
          <MenuRow icon="shield-checkmark-outline" title="Privacy Policy" onPress={() => toggleSection("privacy")} active={activeSection === "privacy"} />
          {activeSection === "privacy" && <InfoPanel title="Privacy Policy" points={[
            "We collect profile details such as name, phone number, email address, and profile photo to create and manage your account.",
            "We use saved addresses and current location only to help you book salon services at home and find nearby salons.",
            "Booking details, selected services, instructions, dates, and times are used to manage service requests between clients and salon owners.",
            "Payment details such as transaction status, invoice number, payment method, and commission split are stored for billing, invoices, and platform records.",
            "We do not store full card, UPI, or banking credentials. Online payments are processed through the payment gateway.",
            "Notifications are used to inform you about booking status, service completion, payment updates, support tickets, and important account activity.",
            "Support chat and ticket messages are saved so admins can resolve user issues, safety concerns, and disputes.",
            "Salon owners receive client information only after accepting a booking, so they can complete the service properly.",
            "Admins may access user, salon, booking, payment, support, and dispute information only for platform operations and safety management.",
            "We protect user data with authentication, role-based access, rate limiting, secure password hashing, audit logs, and restricted API access.",
          ]} styles={styles} />}
          <MenuRow icon="document-text-outline" title="Terms & Conditions" onPress={() => toggleSection("terms")} active={activeSection === "terms"} />
          {activeSection === "terms" && <InfoPanel title="Terms & Conditions" points={[
            "Users must provide correct name, phone number, address, booking date, time, and service details while placing a booking.",
            "Bookings are confirmed only after the salon owner accepts the request. Pending requests may be accepted, rejected, or rescheduled by the salon owner.",
            "Payment is collected only after service completion through online payment or client-confirmed cash payment.",
            "Once a service is completed and payment is confirmed, the amount is generally non-refundable.",
            "Refunds, if any, are allowed only in exceptional cases such as failed online payment, duplicate payment, cancelled service before visit, or admin-approved dispute.",
            "Clients may cancel or reschedule only eligible upcoming bookings. Completed, rejected, or payment-closed bookings cannot be cancelled by the client.",
            "For cash payments, the booking is closed only after the client confirms that cash was paid to the salon owner.",
            "Salon owners are responsible for service quality, staff behavior, punctuality, hygiene, and completing services as accepted.",
            "The platform may charge brokerage or commission from merchant earnings as shown in payment records.",
            "The platform may suspend, reject, or remove users, salon owners, salons, bookings, reviews, or services if fraud, fake information, abuse, unsafe behavior, or policy violation is found.",
          ]} styles={styles} />}
          <MenuRow icon="warning-outline" title="Report A Safety Issue" onPress={() => toggleSection("safety")} active={activeSection === "safety"} />
          {activeSection === "safety" && (
            <View style={styles.inlinePanel}>
              <Text style={styles.panelTitle}>Report A Safety Issue</Text>
              {!!safetySuccess && <Text style={styles.inlineSuccess}>{safetySuccess}</Text>}
              <TextInput value={safetyMessage} onChangeText={(value) => { setSafetyMessage(value); setSafetySuccess(""); }} placeholder="Describe what happened" placeholderTextColor={colors.placeholder} style={styles.messageInput} multiline />
              <TouchableOpacity disabled={saving} onPress={() => void submitSafetyIssue()} style={styles.primary}><Text style={styles.primaryText}>REPORT</Text></TouchableOpacity>
            </View>
          )}
          <MenuRow icon="ticket-outline" title="Raise a ticket" onPress={() => toggleSection("ticket")} active={activeSection === "ticket"} />
          {activeSection === "ticket" && (
            <View style={styles.inlinePanel}>
              <Field label="SUBJECT" value={ticketSubject} onChangeText={setTicketSubject} placeholder="Ticket subject" />
              <TextInput value={ticketMessage} onChangeText={setTicketMessage} placeholder="Write your issue" placeholderTextColor={colors.placeholder} style={styles.messageInput} multiline />
              <TouchableOpacity onPress={submitTicket} style={styles.primary}><Text style={styles.primaryText}>SUBMIT</Text></TouchableOpacity>
            </View>
          )}
          {activeSection === "support" && (
            <View style={styles.inlinePanel} onLayout={(event) => { supportPanelY.current = event.nativeEvent.layout.y; }}>
              <Text style={styles.panelTitle}>{user.role === "ADMIN" ? "Client support requests" : "Help & support"}</Text>
              {supportTickets.length ? supportTickets.map((ticket) => (
                <TouchableOpacity key={ticket.id} onPress={() => { setActiveTicketId(ticket.id); wsRef.current?.send(JSON.stringify({ type: "join", ticketId: ticket.id })); }} style={[styles.ticketRow, activeTicketId === ticket.id && styles.ticketRowActive]}>
                  <View style={styles.ticketCopy}>
                    <Text style={styles.ticketTitle}>{ticket.subject}</Text>
                    {user.role === "ADMIN" && <Text style={styles.ticketClient}>{ticket.client?.name ?? ticket.client?.phone ?? "Client request"}</Text>}
                  </View>
                  <Text style={ticket.status === "ACCEPTED" ? styles.ticketAccepted : styles.ticketPending}>{ticket.status}</Text>
                </TouchableOpacity>
              )) : <Text style={styles.empty}>No support tickets yet.</Text>}
              {user.role === "ADMIN" && supportTickets.find((ticket) => ticket.id === activeTicketId)?.status === "PENDING" && (
                <TouchableOpacity disabled={saving || !activeTicketId} onPress={() => activeTicketId ? void acceptSupportTicket(activeTicketId) : undefined} style={styles.primary}>
                  <Text style={styles.primaryText}>ACCEPT REQUEST</Text>
                </TouchableOpacity>
              )}
              {supportTickets.find((ticket) => ticket.id === activeTicketId)?.status === "ACCEPTED" && (
                <View style={styles.chatPanel}>
                  {supportTickets.find((ticket) => ticket.id === activeTicketId)?.messages.map((message) => (
                    <View key={message.id} style={message.sender.id === user.id ? styles.myMessage : styles.theirMessage}>
                      <Text style={styles.messageAuthor}>{message.sender.id === user.id ? "You" : message.sender.name ?? "Admin"}</Text>
                      <Text style={styles.messageBody}>{message.body}</Text>
                    </View>
                  ))}
                  <TextInput value={chatMessage} onChangeText={setChatMessage} placeholder="Type a message" placeholderTextColor={colors.placeholder} style={styles.input} />
                  <TouchableOpacity onPress={() => activeTicketId ? void sendChatMessage(activeTicketId) : undefined} style={styles.primary}><Text style={styles.primaryText}>SEND CHAT</Text></TouchableOpacity>
                </View>
              )}
              {user.role !== "ADMIN" && (
                <>
                  <Text style={styles.panelTitle}>Raise a new ticket</Text>
                  <Field label="SUBJECT" value={supportSubject} onChangeText={setSupportSubject} placeholder="Support subject" />
                  <TextInput value={supportMessage} onChangeText={setSupportMessage} placeholder="How can we help?" placeholderTextColor={colors.placeholder} style={styles.messageInput} multiline />
                  <TouchableOpacity disabled={saving} onPress={submitSupportMessage} style={styles.primary}><Text style={styles.primaryText}>RAISE TICKET</Text></TouchableOpacity>
                </>
              )}
            </View>
          )}
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

function InfoPanel({ title, body, points, styles }: { title: string; body?: string; points?: string[]; styles: ReturnType<typeof createStyles> }) {
  return (
    <View style={styles.inlinePanel}>
      <Text style={styles.panelTitle}>{title}</Text>
      {!!body && <Text style={styles.panelText}>{body}</Text>}
      {points?.map((point, index) => (
        <View style={styles.infoPoint} key={`${point}-${index}`}>
          <Text style={styles.infoBullet}>{index + 1}.</Text>
          <Text style={styles.infoText}>{point}</Text>
        </View>
      ))}
    </View>
  );
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
  referral: { color: colors.cyan, fontSize: 10, fontWeight: "900", letterSpacing: 1, marginTop: 8 },
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
  panelTitle: { color: colors.text, fontSize: 14, fontWeight: "900", marginBottom: 10 },
  panelText: { color: colors.muted, fontSize: 12, lineHeight: 19 },
  infoPoint: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: 9 },
  infoBullet: { width: 18, color: colors.cyan, fontSize: 11, fontWeight: "900", lineHeight: 18 },
  infoText: { flex: 1, color: colors.muted, fontSize: 12, lineHeight: 18 },
  section: { color: colors.text, fontSize: 12, fontWeight: "800", letterSpacing: 1.4, marginTop: 25, marginBottom: 10 },
  field: { flex: 1, marginBottom: 9 },
  label: { color: colors.muted, fontSize: 9, fontWeight: "800", letterSpacing: 1, marginBottom: 7 },
  input: { color: colors.text, padding: 13, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel, fontSize: 13 },
  messageInput: { color: colors.text, minHeight: 92, padding: 13, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel, fontSize: 13, textAlignVertical: "top" },
  ticketRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel },
  ticketRowActive: { borderColor: colors.cyan, backgroundColor: colors.activePanel },
  ticketCopy: { flex: 1 },
  ticketTitle: { color: colors.text, fontSize: 12, fontWeight: "800" },
  ticketClient: { color: colors.muted, fontSize: 10, marginTop: 4 },
  ticketAccepted: { color: colors.green, fontSize: 9, fontWeight: "900" },
  ticketPending: { color: colors.amber, fontSize: 9, fontWeight: "900" },
  chatPanel: { padding: 10, marginBottom: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel },
  myMessage: { alignSelf: "flex-end", maxWidth: "84%", padding: 10, marginBottom: 8, backgroundColor: colors.activePanel },
  theirMessage: { alignSelf: "flex-start", maxWidth: "84%", padding: 10, marginBottom: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bar },
  messageAuthor: { color: colors.cyan, fontSize: 9, fontWeight: "900", marginBottom: 4 },
  messageBody: { color: colors.text, fontSize: 12, lineHeight: 17 },
  membershipActive: { padding: 12, marginBottom: 12, borderWidth: 1, borderColor: colors.green, backgroundColor: colors.successPanel },
  planCard: { padding: 14, marginBottom: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel },
  planTop: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  planName: { color: colors.text, fontSize: 14, fontWeight: "900", marginBottom: 6 },
  planPrice: { color: colors.green, fontSize: 12, fontWeight: "900" },
  planServices: { color: colors.cyan, fontSize: 11, fontWeight: "900", marginTop: 10, marginBottom: 8 },
  benefit: { color: colors.muted, fontSize: 11, lineHeight: 18 },
  row: { padding: 14, marginBottom: 9, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel },
  value: { color: colors.text, fontSize: 13, fontWeight: "700", marginTop: 7 },
  highlight: { color: colors.cyan, fontSize: 13, fontWeight: "800", marginTop: 7 },
  primary: { alignSelf: "flex-start", alignItems: "center", justifyContent: "center", minHeight: 36, marginTop: 7, paddingVertical: 9, paddingHorizontal: 16, backgroundColor: colors.cyan },
  primaryText: { color: colors.buttonText, fontWeight: "900", fontSize: 9, letterSpacing: 1 },
  secondary: { alignItems: "center", padding: 12, marginTop: 10, borderWidth: 1, borderColor: colors.cyan },
  secondaryText: { color: colors.cyan, fontWeight: "900", fontSize: 10, letterSpacing: 1.1 },
  notice: { color: colors.green, fontSize: 11, marginTop: 14 },
  error: { color: colors.danger, fontSize: 11, marginTop: 14 },
  inlineSuccess: { color: colors.green, fontSize: 12, fontWeight: "800", marginBottom: 10 },
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
