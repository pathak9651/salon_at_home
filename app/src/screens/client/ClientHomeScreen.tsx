import * as Location from "expo-location";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Image, Linking, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { apiRequest } from "../../api/client";
import { ThemeColors, useTheme } from "../../utils/theme";
import { KeyboardAwareScreen } from "../common/KeyboardAwareScreen";
import { ScreenHeader } from "../common/ScreenHeader";

type Coordinates = { latitude: number; longitude: number };
type Service = { id: string; name: string; description?: string | null; price: number; durationMin: number };
type SalonImage = { id: string; url: string; caption?: string | null };
type Review = { id: string; rating: number; comment?: string | null; createdAt: string; client?: { name?: string | null } };
type Salon = {
  id: string;
  name: string;
  description?: string | null;
  address: string;
  latitude: number;
  longitude: number;
  imageUrl?: string | null;
  coverImageUrl?: string | null;
  rating?: number | null;
  reviewCount?: number;
  distanceKm?: number | null;
  minServicePrice?: number | null;
  images: SalonImage[];
  services: Service[];
  reviews?: Review[];
};

type BookingConfirmation = {
  id: string;
  scheduledAt: string;
  address: string;
  instructions?: string | null;
  totalAmount: number;
  status: string;
};

const serviceFilters = ["Haircut", "Hair spa", "Skin care", "Grooming"];
const ratingFilters = [0, 3, 4, 4.5];
const distanceFilters = [5, 10, 25, 50];
const priceFilters = [0, 500, 1000, 2000];

export function ClientHomeScreen({ token, onBookingCompleted }: { token: string; onBookingCompleted: () => void }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const [location, setLocation] = useState<Coordinates | null>(null);
  const [area, setArea] = useState("Detect your location");
  const [salons, setSalons] = useState<Salon[]>([]);
  const [selectedSalon, setSelectedSalon] = useState<Salon | null>(null);
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [bookingDate, setBookingDate] = useState("");
  const [bookingTime, setBookingTime] = useState("");
  const [bookingDateValue, setBookingDateValue] = useState<Date | null>(null);
  const [bookingTimeValue, setBookingTimeValue] = useState<Date | null>(null);
  const [bookingAddress, setBookingAddress] = useState("");
  const [bookingInstructions, setBookingInstructions] = useState("");
  const [bookingConfirmation, setBookingConfirmation] = useState<BookingConfirmation | null>(null);
  const [bookingSuccess, setBookingSuccess] = useState("");
  const [search, setSearch] = useState("");
  const [service, setService] = useState("");
  const [minRating, setMinRating] = useState(0);
  const [radiusKm, setRadiusKm] = useState(25);
  const [maxPrice, setMaxPrice] = useState(0);
  const [showFilters, setShowFilters] = useState(false);
  const [loadingLocation, setLoadingLocation] = useState(false);
  const [loadingSalons, setLoadingSalons] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookingAddressLoading, setBookingAddressLoading] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void loadSalons();
  }, []);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (location) {
      params.set("lat", String(location.latitude));
      params.set("lng", String(location.longitude));
      params.set("radiusKm", String(radiusKm));
    }
    if (search.trim()) params.set("search", search.trim());
    if (service) params.set("service", service);
    if (minRating) params.set("minRating", String(minRating));
    if (maxPrice) params.set("maxPrice", String(maxPrice));
    return params.toString();
  }, [location, radiusKm, search, service, minRating, maxPrice]);

  async function loadSalons(query = queryString) {
    setLoadingSalons(true);
    setError("");
    try {
      setSalons(await apiRequest<Salon[]>(`/salons${query ? `?${query}` : ""}`));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load salons");
    } finally {
      setLoadingSalons(false);
    }
  }

  async function detectLocation() {
    setLoadingLocation(true);
    setError("");
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setError("Allow location access to find nearby salons.");
        return;
      }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const nextLocation = { latitude: position.coords.latitude, longitude: position.coords.longitude };
      setLocation(nextLocation);
      const [place] = await Location.reverseGeocodeAsync(nextLocation);
      setArea([place?.district, place?.city, place?.region].filter(Boolean).slice(0, 2).join(", ") || "Current location");
      const params = new URLSearchParams(queryString);
      params.set("lat", String(nextLocation.latitude));
      params.set("lng", String(nextLocation.longitude));
      params.set("radiusKm", String(radiusKm));
      await loadSalons(params.toString());
    } catch (locationError) {
      setError(locationError instanceof Error ? locationError.message : "Could not detect location");
    } finally {
      setLoadingLocation(false);
    }
  }

  async function openDetails(salon: Salon) {
    setSelectedSalon(salon);
    setSelectedServiceIds([]);
    setBookingConfirmation(null);
    setBookingSuccess("");
    setLoadingDetails(true);
    try {
      setSelectedSalon(await apiRequest<Salon>(`/salons/${salon.id}`));
    } catch (detailError) {
      setError(detailError instanceof Error ? detailError.message : "Could not load salon details");
    } finally {
      setLoadingDetails(false);
    }
  }

  async function openMaps(salon: Salon) {
    const destination = `${salon.latitude},${salon.longitude}`;
    const origin = location ? `&origin=${location.latitude},${location.longitude}` : "";
    await Linking.openURL(`https://www.google.com/maps/dir/?api=1${origin}&destination=${destination}&travelmode=driving`);
  }

  function toggleService(serviceId: string) {
    setSelectedServiceIds((current) => current.includes(serviceId) ? current.filter((id) => id !== serviceId) : [...current, serviceId]);
  }

  async function confirmBooking(salon: Salon) {
    setBookingLoading(true);
    setError("");
    setBookingConfirmation(null);
    setBookingSuccess("");
    try {
      if (!selectedServiceIds.length) throw new Error("Choose at least one service");
      if (!bookingDate || !bookingTime) throw new Error("Choose preferred date and time");
      if (!bookingAddress.trim()) throw new Error("Add your home service address");
      const scheduledAt = new Date(`${bookingDate}T${bookingTime}:00`);
      if (Number.isNaN(scheduledAt.getTime())) throw new Error("Enter date and time in the correct format");

      const booking = await apiRequest<BookingConfirmation>("/bookings", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          salonId: salon.id,
          serviceIds: selectedServiceIds,
          scheduledAt: scheduledAt.toISOString(),
          address: bookingAddress,
          instructions: bookingInstructions || undefined,
        }),
      });
      resetBookingForm();
      setBookingConfirmation(booking);
      setBookingSuccess("Your booking is successful");
      setTimeout(() => {
        setBookingSuccess("");
        setSelectedSalon(null);
        onBookingCompleted();
      }, 1200);
    } catch (bookingError) {
      setError(bookingError instanceof Error ? bookingError.message : "Could not confirm booking");
    } finally {
      setBookingLoading(false);
    }
  }

  function resetBookingForm() {
    setSelectedServiceIds([]);
    setBookingDate("");
    setBookingTime("");
    setBookingDateValue(null);
    setBookingTimeValue(null);
    setBookingAddress("");
    setBookingInstructions("");
    setBookingConfirmation(null);
    setShowDatePicker(false);
    setShowTimePicker(false);
  }

  function autofillBookingTime() {
    const nextSlot = new Date();
    nextSlot.setHours(nextSlot.getHours() + 2, 0, 0, 0);
    setBookingDateValue(nextSlot);
    setBookingTimeValue(nextSlot);
    setBookingDate(nextSlot.toISOString().slice(0, 10));
    setBookingTime(`${String(nextSlot.getHours()).padStart(2, "0")}:${String(nextSlot.getMinutes()).padStart(2, "0")}`);
  }

  function updateBookingDate(_event: DateTimePickerEvent, selectedDate?: Date) {
    setShowDatePicker(false);
    if (!selectedDate) return;
    setBookingDateValue(selectedDate);
    setBookingDate(selectedDate.toISOString().slice(0, 10));
  }

  function updateBookingTime(_event: DateTimePickerEvent, selectedTime?: Date) {
    setShowTimePicker(false);
    if (!selectedTime) return;
    setBookingTimeValue(selectedTime);
    setBookingTime(`${String(selectedTime.getHours()).padStart(2, "0")}:${String(selectedTime.getMinutes()).padStart(2, "0")}`);
  }

  async function autofillBookingAddress() {
    setBookingAddressLoading(true);
    setError("");
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setError("Allow location access to auto-fill your booking address.");
        return;
      }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const [place] = await Location.reverseGeocodeAsync(position.coords);
      if (!place) throw new Error("Could not detect your address");
      const detectedAddress = [
        [place.name, place.street].filter(Boolean).join(", "),
        place.district,
        place.city,
        place.region,
        place.postalCode,
      ].filter(Boolean).join(", ");
      setBookingAddress(detectedAddress);
      if (!location) {
        setLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude });
        setArea([place.district, place.city, place.region].filter(Boolean).slice(0, 2).join(", ") || "Current location");
      }
    } catch (addressError) {
      setError(addressError instanceof Error ? addressError.message : "Could not auto-fill address");
    } finally {
      setBookingAddressLoading(false);
    }
  }

  const activeFilterCount = (radiusKm !== 25 ? 1 : 0) + (minRating ? 1 : 0) + (maxPrice ? 1 : 0) + (service ? 1 : 0);

  if (selectedSalon) {
    const gallery = [selectedSalon.coverImageUrl, selectedSalon.imageUrl, ...selectedSalon.images.map((image) => image.url)].filter(Boolean) as string[];
    return (
      <KeyboardAwareScreen contentContainerStyle={styles.page}>
        <TouchableOpacity onPress={() => setSelectedSalon(null)} style={styles.secondary}><Text style={styles.secondaryText}>BACK TO SALONS</Text></TouchableOpacity>
        <Text style={styles.detailTitle}>{selectedSalon.name}</Text>
        <Text style={styles.rating}>{ratingText(selectedSalon)}{selectedSalon.distanceKm !== null && selectedSalon.distanceKm !== undefined ? `  |  ${selectedSalon.distanceKm.toFixed(1)} km` : ""}</Text>
        <Text style={styles.address}>{selectedSalon.address}</Text>
        {!!selectedSalon.description && <Text style={styles.description}>{selectedSalon.description}</Text>}
        {loadingDetails ? <ActivityIndicator color={colors.cyan} /> : null}

        <Text style={styles.section}>SALON IMAGES</Text>
        {gallery.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false}>{gallery.map((url, index) => <Image key={`${url}-${index}`} source={{ uri: url }} style={styles.galleryImage} />)}</ScrollView> : <View style={styles.imagePlaceholder}><Text style={styles.empty}>No images uploaded yet.</Text></View>}

        <Text style={styles.section}>REVIEWS & RATINGS</Text>
        <View style={styles.reviewSummary}>
          <Text style={styles.reviewScore}>{selectedSalon.rating ? selectedSalon.rating.toFixed(1) : "NEW"}</Text>
          <Text style={styles.reviewMeta}>{selectedSalon.reviewCount ?? 0} review(s)</Text>
        </View>
        {selectedSalon.reviews?.length ? selectedSalon.reviews.slice(0, 5).map((review) => (
          <View style={styles.reviewCard} key={review.id}>
            <Text style={styles.reviewStars}>{"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}</Text>
            <Text style={styles.reviewAuthor}>{review.client?.name ?? "Client"} | {new Date(review.createdAt).toLocaleDateString()}</Text>
            {!!review.comment && <Text style={styles.reviewComment}>{review.comment}</Text>}
          </View>
        )) : <Text style={styles.empty}>No reviews yet.</Text>}

        <Text style={styles.section}>BOOK AT HOME</Text>
        <View style={styles.bookingPanel}>
          <Text style={styles.stepLabel}>1. CHOOSE SERVICES</Text>
          {selectedSalon.services.length ? selectedSalon.services.map((item) => (
            <TouchableOpacity onPress={() => toggleService(item.id)} style={[styles.serviceRow, selectedServiceIds.includes(item.id) && styles.serviceSelected]} key={item.id}>
              <View style={styles.checkCircle}><Text style={selectedServiceIds.includes(item.id) ? styles.checkActive : styles.checkInactive}>{selectedServiceIds.includes(item.id) ? "✓" : "+"}</Text></View>
              <View style={styles.salonCopy}>
                <Text style={styles.name}>{item.name}</Text>
                {!!item.description && <Text style={styles.meta}>{item.description}</Text>}
                <Text style={styles.meta}>{item.durationMin} min</Text>
              </View>
              <Text style={styles.charge}>INR {item.price}</Text>
            </TouchableOpacity>
          )) : <Text style={styles.empty}>No services listed.</Text>}

          <Text style={styles.stepLabel}>2. SELECT DATE & TIME</Text>
          <TouchableOpacity onPress={autofillBookingTime} style={styles.quickButton}><Text style={styles.secondaryText}>USE NEXT AVAILABLE SLOT</Text></TouchableOpacity>
          <View style={styles.bookingStack}>
            <TouchableOpacity onPress={() => setShowDatePicker(true)} style={styles.bookingPicker}>
              <Text style={styles.pickerLabel}>DATE</Text>
              <Text style={bookingDate ? styles.pickerValue : styles.pickerPlaceholder}>{bookingDate || "Select date"}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowTimePicker(true)} style={styles.bookingPicker}>
              <Text style={styles.pickerLabel}>TIME</Text>
              <Text style={bookingTime ? styles.pickerValue : styles.pickerPlaceholder}>{bookingTime || "Select time"}</Text>
            </TouchableOpacity>
          </View>
          {showDatePicker && <DateTimePicker value={bookingDateValue ?? new Date()} mode="date" minimumDate={new Date()} display="default" onChange={updateBookingDate} />}
          {showTimePicker && <DateTimePicker value={bookingTimeValue ?? new Date()} mode="time" display="default" onChange={updateBookingTime} />}

          <Text style={styles.stepLabel}>3. ADD HOME ADDRESS</Text>
          <TouchableOpacity disabled={bookingAddressLoading} onPress={() => void autofillBookingAddress()} style={styles.quickButton}>
            {bookingAddressLoading ? <ActivityIndicator color={colors.cyan} /> : <Text style={styles.secondaryText}>AUTO DETECT ADDRESS</Text>}
          </TouchableOpacity>
          <TextInput value={bookingAddress} onChangeText={setBookingAddress} placeholder="Home service address" placeholderTextColor={colors.placeholder} style={[styles.bookingInput, styles.addressInput]} multiline />

          <Text style={styles.stepLabel}>4. INSTRUCTIONS</Text>
          <TextInput value={bookingInstructions} onChangeText={setBookingInstructions} placeholder="Booking instructions, access notes, preferences" placeholderTextColor={colors.placeholder} style={[styles.bookingInput, styles.instructionsInput]} multiline />
          <View style={styles.bookingSummaryCard}>
            <Text style={styles.summaryTitle}>BOOKING SUMMARY</Text>
            <Text style={styles.summaryLine}>{selectedServiceIds.length || 0} service(s)</Text>
            <Text style={styles.summaryAmount}>INR {selectedSalon.services.filter((item) => selectedServiceIds.includes(item.id)).reduce((sum, item) => sum + item.price, 0)}</Text>
          </View>
          {!!bookingSuccess && <View style={styles.successBadge}>
            <Text style={styles.successTitle}>{bookingSuccess}</Text>
            {!!bookingConfirmation && <Text style={styles.successText}>Status {bookingConfirmation.status} | INR {bookingConfirmation.totalAmount}</Text>}
          </View>}
          <TouchableOpacity disabled={bookingLoading || !!bookingSuccess} onPress={() => void confirmBooking(selectedSalon)} style={styles.confirmButton}>
            {bookingLoading ? <ActivityIndicator color={colors.buttonText} /> : <Text style={styles.primaryText}>CONFIRM BOOKING</Text>}
          </TouchableOpacity>
        </View>
        <TouchableOpacity onPress={() => void openMaps(selectedSalon)} style={styles.primary}><Text style={styles.primaryText}>OPEN IN GOOGLE MAPS</Text></TouchableOpacity>
      </KeyboardAwareScreen>
    );
  }

  return (
    <KeyboardAwareScreen contentContainerStyle={styles.page}>
      <ScreenHeader eyebrow="SALON AT HOME // CLIENT" title="Salon discovery" subtitle="Search nearby salons and compare distance, ratings, services, and charges." />
      <View style={styles.location}>
        <View>
          <Text style={styles.online}>{location ? "LOCATION ACTIVE" : "LOCATION REQUIRED"}</Text>
          <Text style={styles.locationText}>{area}</Text>
        </View>
        <TouchableOpacity disabled={loadingLocation} onPress={() => void detectLocation()} style={styles.detectButton}>
          {loadingLocation ? <ActivityIndicator color={colors.buttonText} /> : <Text style={styles.detectText}>DETECT</Text>}
        </TouchableOpacity>
      </View>

      <TextInput value={search} onChangeText={setSearch} placeholder="Search salon, area, or service" placeholderTextColor={colors.placeholder} style={styles.searchInput} />
      <View style={styles.actions}>
        <TouchableOpacity onPress={() => void loadSalons()} style={styles.primary}><Text style={styles.primaryText}>SEARCH</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => { setSearch(""); setService(""); setMinRating(0); setMaxPrice(0); setRadiusKm(25); void loadSalons(""); }} style={styles.secondary}><Text style={styles.secondaryText}>RESET</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => setShowFilters((current) => !current)} style={styles.secondary}><Text style={styles.secondaryText}>{activeFilterCount ? `FILTERS (${activeFilterCount})` : "FILTERS"}</Text></TouchableOpacity>
      </View>

      {showFilters && <View style={styles.filterPanel}>
        <Text style={styles.filterSection}>DISTANCE</Text>
        <FilterRow values={distanceFilters.map((value) => `${value} km`)} active={`${radiusKm} km`} onPress={(value) => setRadiusKm(Number(value.replace(" km", "")))} styles={styles} />
        <Text style={styles.filterSection}>RATING</Text>
        <FilterRow values={ratingFilters.map((value) => value ? `${value}+` : "Any")} active={minRating ? `${minRating}+` : "Any"} onPress={(value) => setMinRating(value === "Any" ? 0 : Number(value.replace("+", "")))} styles={styles} />
        <Text style={styles.filterSection}>PRICE</Text>
        <FilterRow values={priceFilters.map((value) => value ? `Under ${value}` : "Any")} active={maxPrice ? `Under ${maxPrice}` : "Any"} onPress={(value) => setMaxPrice(value === "Any" ? 0 : Number(value.replace("Under ", "")))} styles={styles} />
        <Text style={styles.filterSection}>SERVICES</Text>
        <FilterRow values={["Any", ...serviceFilters]} active={service || "Any"} onPress={(value) => setService(value === "Any" ? "" : value)} styles={styles} />
        <TouchableOpacity onPress={() => { setShowFilters(false); void loadSalons(); }} style={styles.applyFilters}><Text style={styles.primaryText}>APPLY FILTERS</Text></TouchableOpacity>
      </View>}

      {!!error && <Text style={styles.error}>{error}</Text>}
      <Text style={styles.section}>SALONS</Text>
      {loadingSalons ? <ActivityIndicator color={colors.cyan} /> : null}
      {!loadingSalons && !salons.length ? <Text style={styles.empty}>No salons match these filters.</Text> : null}
      {salons.map((salon) => (
        <TouchableOpacity onPress={() => void openDetails(salon)} style={styles.salon} key={salon.id}>
          {salon.coverImageUrl ? <Image source={{ uri: salon.coverImageUrl }} style={styles.coverThumb} /> : <View style={styles.coverFallback}><Text style={styles.code}>SA</Text></View>}
          <View style={styles.salonCopy}>
            <Text style={styles.name}>{salon.name}</Text>
            <Text style={styles.rating}>{ratingText(salon)}{salon.distanceKm !== null && salon.distanceKm !== undefined ? `  |  ${salon.distanceKm.toFixed(1)} km` : ""}</Text>
            <Text style={styles.address}>{salon.address}</Text>
            <Text style={styles.meta}>{serviceText(salon)}</Text>
          </View>
          <TouchableOpacity onPress={() => void openMaps(salon)} style={styles.mapBadge}><Text style={styles.mapText}>MAP</Text></TouchableOpacity>
        </TouchableOpacity>
      ))}
    </KeyboardAwareScreen>
  );
}

function FilterRow({ values, active, onPress, styles }: { values: string[]; active: string; onPress: (value: string) => void; styles: ReturnType<typeof createStyles> }) {
  return <ScrollView horizontal showsHorizontalScrollIndicator={false}>{values.map((value) => <TouchableOpacity key={value} onPress={() => onPress(value)} style={[styles.filter, active === value && styles.filterActive]}><Text style={[styles.filterText, active === value && styles.filterTextActive]}>{value}</Text></TouchableOpacity>)}</ScrollView>;
}

function ratingText(salon: Salon) {
  if (!salon.rating) return "NEW";
  return `RATING ${salon.rating.toFixed(1)} (${salon.reviewCount ?? 0})`;
}

function serviceText(salon: Salon) {
  if (!salon.services.length) return "Services coming soon";
  const cheapest = salon.minServicePrice ?? Math.min(...salon.services.map((item) => item.price));
  return `${salon.services.slice(0, 2).map((item) => item.name).join(", ")} | From INR ${cheapest}`;
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    page: { padding: 20, paddingBottom: 28 },
    location: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, padding: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel },
    online: { color: colors.green, fontSize: 9, fontWeight: "800", letterSpacing: 1 },
    locationText: { color: colors.text, fontSize: 12, marginTop: 5 },
    detectButton: { minWidth: 76, alignItems: "center", justifyContent: "center", padding: 10, backgroundColor: colors.cyan },
    detectText: { color: colors.buttonText, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
    searchInput: { color: colors.text, padding: 13, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel, fontSize: 13, marginTop: 12 },
    actions: { flexDirection: "row", gap: 10, marginTop: 10 },
    primary: { alignItems: "center", justifyContent: "center", minHeight: 42, paddingHorizontal: 14, backgroundColor: colors.cyan },
    primaryText: { color: colors.buttonText, fontSize: 10, fontWeight: "900", letterSpacing: 1 },
    secondary: { alignItems: "center", justifyContent: "center", minHeight: 42, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.cyan },
    secondaryText: { color: colors.cyan, fontSize: 10, fontWeight: "900", letterSpacing: 1 },
    section: { color: colors.text, fontWeight: "700", fontSize: 12, letterSpacing: 1.5, marginTop: 22, marginBottom: 10 },
    filterPanel: { padding: 12, marginTop: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel },
    filterSection: { color: colors.text, fontWeight: "800", fontSize: 10, letterSpacing: 1.2, marginTop: 12, marginBottom: 8 },
    filter: { paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel, marginRight: 8 },
    filterActive: { borderColor: colors.cyan, backgroundColor: colors.activePanel },
    filterText: { color: colors.muted, fontSize: 10, fontWeight: "800" },
    filterTextActive: { color: colors.cyan },
    applyFilters: { alignItems: "center", justifyContent: "center", minHeight: 42, paddingHorizontal: 14, backgroundColor: colors.cyan, marginTop: 14 },
    error: { color: colors.danger, fontSize: 11, marginTop: 14 },
    salon: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel },
    coverThumb: { width: 62, height: 62, backgroundColor: colors.panelRaised },
    coverFallback: { width: 62, height: 62, alignItems: "center", justifyContent: "center", backgroundColor: colors.panelRaised, borderWidth: 1, borderColor: colors.border },
    code: { color: colors.cyan, fontWeight: "900", fontSize: 12 },
    salonCopy: { flex: 1 },
    name: { color: colors.text, fontWeight: "800", fontSize: 14 },
    rating: { color: colors.amber, fontSize: 10, marginTop: 6 },
    address: { color: colors.text, fontSize: 11, lineHeight: 16, marginTop: 7 },
    meta: { color: colors.muted, fontSize: 10, marginTop: 6 },
    mapBadge: { width: 42, height: 42, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.cyan },
    mapText: { color: colors.cyan, fontSize: 9, fontWeight: "900" },
    empty: { color: colors.muted, fontSize: 12, lineHeight: 18 },
    detailTitle: { color: colors.text, fontSize: 28, fontWeight: "900", marginTop: 16 },
    description: { color: colors.muted, fontSize: 12, lineHeight: 19, marginTop: 12 },
    galleryImage: { width: 180, height: 120, marginRight: 10, backgroundColor: colors.panelRaised },
    imagePlaceholder: { minHeight: 90, justifyContent: "center", padding: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel },
    reviewSummary: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: colors.heroBorder, backgroundColor: colors.panelRaised },
    reviewScore: { color: colors.amber, fontSize: 24, fontWeight: "900" },
    reviewMeta: { color: colors.text, fontSize: 12, fontWeight: "800" },
    reviewCard: { padding: 13, marginBottom: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel },
    reviewStars: { color: colors.amber, fontSize: 14, fontWeight: "900" },
    reviewAuthor: { color: colors.muted, fontSize: 10, marginTop: 7 },
    reviewComment: { color: colors.text, fontSize: 12, lineHeight: 18, marginTop: 8 },
    serviceRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background },
    serviceSelected: { borderColor: colors.cyan, backgroundColor: colors.activePanel },
    charge: { color: colors.cyan, fontSize: 13, fontWeight: "900" },
    checkCircle: { width: 30, height: 30, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.cyan },
    checkActive: { color: colors.cyan, fontSize: 18, fontWeight: "900" },
    checkInactive: { color: colors.muted, fontSize: 18, fontWeight: "900" },
    bookingPanel: { padding: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel },
    stepLabel: { color: colors.amber, fontSize: 10, fontWeight: "900", letterSpacing: 1.2, marginTop: 14, marginBottom: 10 },
    quickButton: { alignItems: "center", justifyContent: "center", minHeight: 42, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.cyan, marginBottom: 10 },
    bookingStack: { gap: 0 },
    bookingPicker: { padding: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, marginBottom: 10 },
    pickerLabel: { color: colors.muted, fontSize: 9, fontWeight: "900", letterSpacing: 1, marginBottom: 6 },
    pickerValue: { color: colors.text, fontSize: 15, fontWeight: "800" },
    pickerPlaceholder: { color: colors.placeholder, fontSize: 15, fontWeight: "700" },
    bookingInput: { color: colors.text, padding: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, fontSize: 13, marginBottom: 10 },
    addressInput: { minHeight: 64, textAlignVertical: "top" },
    instructionsInput: { minHeight: 78, textAlignVertical: "top" },
    bookingSummaryCard: { padding: 14, marginTop: 4, marginBottom: 10, borderWidth: 1, borderColor: colors.heroBorder, backgroundColor: colors.panelRaised },
    summaryTitle: { color: colors.muted, fontSize: 9, fontWeight: "900", letterSpacing: 1.2 },
    summaryLine: { color: colors.text, fontSize: 12, fontWeight: "800", marginTop: 8 },
    summaryAmount: { color: colors.cyan, fontSize: 20, fontWeight: "900", marginTop: 8 },
    confirmButton: { alignItems: "center", justifyContent: "center", minHeight: 50, paddingHorizontal: 14, backgroundColor: colors.cyan, marginTop: 4 },
    successBadge: { padding: 14, marginBottom: 10, borderWidth: 1, borderColor: colors.green, backgroundColor: colors.successPanel },
    successTitle: { color: colors.green, fontSize: 13, fontWeight: "900" },
    successText: { color: colors.text, fontSize: 11, fontWeight: "700", marginTop: 6 },
  });
}
