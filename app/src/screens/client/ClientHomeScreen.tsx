import * as Location from "expo-location";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Image, Linking, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { apiAssetUrl, apiRequest } from "../../api/client";
import { ThemeColors, useTheme } from "../../utils/theme";
import { KeyboardAwareScreen } from "../common/KeyboardAwareScreen";
import { ScreenHeader } from "../common/ScreenHeader";

type Coordinates = { latitude: number; longitude: number };
type GenderPreference = "M" | "F";
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
const menKeywords = ["men", "male", "boy", "gents", "gentleman", "beard", "shave", "trim", "grooming", "haircut"];
const womenKeywords = ["women", "female", "girl", "ladies", "bridal", "makeup", "facial", "wax", "threading", "manicure", "pedicure", "spa", "skin"];

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
  const [genderPreference, setGenderPreference] = useState<GenderPreference>("M");
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
  const suggestedSalons = sortSalonsForGender(salons, genderPreference);
  const featuredSalon = suggestedSalons[0] ?? salons[0] ?? null;
  const featuredServices = genderFilteredServices(suggestedSalons, genderPreference).slice(0, 8);
  const nearbyDeals = suggestedSalons.slice(0, 6);
  const suggestionLabel = genderPreference === "M" ? "Men's grooming" : "Women's beauty";

  if (selectedSalon) {
    const gallery = [selectedSalon.coverImageUrl, selectedSalon.imageUrl, ...selectedSalon.images.map((image) => image.url)].filter(Boolean) as string[];
    const selectedServices = selectedSalon.services.filter((item) => selectedServiceIds.includes(item.id));
    const bookingTotal = selectedServices.reduce((sum, item) => sum + item.price, 0);
    const readySteps = [selectedServiceIds.length > 0, !!bookingDate && !!bookingTime, !!bookingAddress.trim()].filter(Boolean).length;
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
          <View style={styles.bookingHero}>
            <View style={styles.bookingHeroIcon}><Ionicons name="calendar-outline" size={24} color={colors.cyan} /></View>
            <View style={styles.salonCopy}>
              <Text style={styles.bookingHeroTitle}>Build your home visit</Text>
              <Text style={styles.bookingHeroMeta}>{readySteps}/3 required steps ready</Text>
            </View>
            <Text style={styles.bookingHeroAmount}>INR {bookingTotal}</Text>
          </View>

          <StepHeader number="1" title="Choose services" done={selectedServiceIds.length > 0} styles={styles} />
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
          {selectedServices.length ? <View style={styles.selectedStrip}>
            {selectedServices.map((item) => <View style={styles.selectedPill} key={item.id}><Text style={styles.selectedPillText}>{item.name}</Text></View>)}
          </View> : null}

          <StepHeader number="2" title="Select date and time" done={!!bookingDate && !!bookingTime} styles={styles} />
          <TouchableOpacity accessibilityLabel="Use next available slot" accessibilityRole="button" onPress={autofillBookingTime} style={styles.quickIconButton}>
            <Ionicons name="flash-outline" size={22} color={colors.cyan} />
          </TouchableOpacity>
          <View style={styles.bookingGrid}>
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

          <StepHeader number="3" title="Add home address" done={!!bookingAddress.trim()} styles={styles} />
          <TouchableOpacity accessibilityLabel="Auto detect address" accessibilityRole="button" disabled={bookingAddressLoading} onPress={() => void autofillBookingAddress()} style={styles.quickIconButton}>
            {bookingAddressLoading ? <ActivityIndicator color={colors.cyan} /> : <Ionicons name="locate" size={22} color={colors.cyan} />}
          </TouchableOpacity>
          <TextInput value={bookingAddress} onChangeText={setBookingAddress} placeholder="Home service address" placeholderTextColor={colors.placeholder} style={[styles.bookingInput, styles.addressInput]} multiline />

          <StepHeader number="4" title="Instructions" done={!!bookingInstructions.trim()} optional styles={styles} />
          <TextInput value={bookingInstructions} onChangeText={setBookingInstructions} placeholder="Booking instructions, access notes, preferences" placeholderTextColor={colors.placeholder} style={[styles.bookingInput, styles.instructionsInput]} multiline />
          <View style={styles.bookingSummaryCard}>
            <View>
              <Text style={styles.summaryTitle}>BOOKING SUMMARY</Text>
              <Text style={styles.summaryLine}>{selectedServices.length || 0} service(s) selected</Text>
              <Text style={styles.summaryLine}>{bookingDate && bookingTime ? `${bookingDate} at ${bookingTime}` : "Choose date and time"}</Text>
            </View>
            <Text style={styles.summaryAmount}>INR {bookingTotal}</Text>
          </View>
          {!!bookingSuccess && <View style={styles.successBadge}>
            <Text style={styles.successTitle}>{bookingSuccess}</Text>
            {!!bookingConfirmation && <Text style={styles.successText}>Status {bookingConfirmation.status} | INR {bookingConfirmation.totalAmount}</Text>}
          </View>}
          <TouchableOpacity disabled={bookingLoading || !!bookingSuccess} onPress={() => void confirmBooking(selectedSalon)} style={styles.confirmButton}>
            {bookingLoading ? <ActivityIndicator color={colors.buttonText} /> : <Text style={styles.primaryText}>CONFIRM BOOKING</Text>}
          </TouchableOpacity>
        </View>
        <TouchableOpacity accessibilityLabel="Open in Google Maps" accessibilityRole="button" onPress={() => void openMaps(selectedSalon)} style={styles.mapIconButton}>
          <Ionicons name="map-outline" size={22} color={colors.buttonText} />
        </TouchableOpacity>
      </KeyboardAwareScreen>
    );
  }

  return (
    <KeyboardAwareScreen contentContainerStyle={styles.page}>
      <View style={styles.clientTop}>
        <View>
          <View style={styles.locationTitleRow}>
            <Ionicons name="location" size={24} color={colors.cyan} />
            <Text style={styles.locationTitle}>{area.split(",")[0] || "Your area"}</Text>
          </View>
          <Text style={styles.locationSub}>{location ? area : "Detect location for nearby salons"}</Text>
        </View>
        <View style={styles.headerActions}>
          <View style={styles.genderToggle}>
            <TouchableOpacity onPress={() => setGenderPreference("M")} style={genderPreference === "M" ? styles.genderActive : styles.genderIdle}><Text style={genderPreference === "M" ? styles.genderActiveText : styles.genderIdleText}>M</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => setGenderPreference("F")} style={genderPreference === "F" ? styles.genderActive : styles.genderIdle}><Text style={genderPreference === "F" ? styles.genderActiveText : styles.genderIdleText}>F</Text></TouchableOpacity>
          </View>
        </View>
      </View>

      <TouchableOpacity disabled={loadingLocation} onPress={() => void detectLocation()} style={styles.detectStrip}>
        {loadingLocation ? <ActivityIndicator color={colors.buttonText} /> : <>
          <Ionicons name="navigate" size={16} color={colors.buttonText} />
          <Text style={styles.detectText}>{location ? "Refresh nearby salons" : "Detect current location"}</Text>
        </>}
      </TouchableOpacity>

      <View style={styles.heroBanner}>
        <View style={styles.heroCopy}>
          <Text style={styles.heroKicker}>{suggestionLabel.toUpperCase()}</Text>
          <Text style={styles.heroTitle}>Salon at home in 30 minutes</Text>
          <TouchableOpacity onPress={() => featuredSalon ? void openDetails(featuredSalon) : undefined} style={styles.bookNowBadge}>
            <Text style={styles.bookNowText}>Book Now</Text>
          </TouchableOpacity>
        </View>
        {featuredSalon?.coverImageUrl ? (
          <Image source={{ uri: apiAssetUrl(featuredSalon.coverImageUrl) }} style={styles.heroImage} />
        ) : (
          <View style={styles.heroIllustration}><Ionicons name="cut" size={56} color={colors.cyan} /></View>
        )}
      </View>

      <TouchableOpacity onPress={() => setShowFilters((current) => !current)} style={styles.promoStrip}>
        <Text style={styles.promoStrong}>SALON SILVER</Text>
        <Text style={styles.promoText}>Get 15% OFF on all bookings</Text>
        <Ionicons name="chevron-forward" size={22} color={colors.text} />
      </TouchableOpacity>

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

      <View style={styles.sectionHeader}>
        <View>
          <Text style={styles.sectionTitle}><Text style={styles.accentWord}>Insta</Text> Salon At Home</Text>
          <Text style={styles.sectionSub}>{suggestionLabel} in <Text style={styles.accentWord}>30 mins</Text></Text>
        </View>
        <TouchableOpacity onPress={() => void loadSalons()}><Text style={styles.seeAll}>See all</Text></TouchableOpacity>
      </View>
      {loadingSalons ? <ActivityIndicator color={colors.cyan} /> : null}
      {!loadingSalons && !salons.length ? <Text style={styles.empty}>No salons match these filters.</Text> : null}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.serviceRail}>
        {featuredServices.map((item, index) => (
          <TouchableOpacity onPress={() => void openDetails(item.salon)} style={styles.serviceTile} key={`${item.salon.id}-${item.id}-${index}`}>
            {item.salon.coverImageUrl ? <Image source={{ uri: apiAssetUrl(item.salon.coverImageUrl) }} style={styles.serviceImage} /> : <View style={styles.serviceImageFallback}><Ionicons name="sparkles" size={34} color={colors.cyan} /></View>}
            <Text style={styles.serviceName}>{item.name}</Text>
            <Text style={styles.servicePrice}>INR {item.price}</Text>
            <View style={styles.serviceBook}><Text style={styles.serviceBookText}>Book</Text></View>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={styles.divider} />

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>At the Salon Deals</Text>
        <TouchableOpacity onPress={() => void loadSalons()}><Text style={styles.seeAll}>See all</Text></TouchableOpacity>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dealRail}>
        {nearbyDeals.map((salon, index) => (
          <TouchableOpacity onPress={() => void openDetails(salon)} style={styles.dealCard} key={`${salon.id}-${index}`}>
            {salon.coverImageUrl ? <Image source={{ uri: apiAssetUrl(salon.coverImageUrl) }} style={styles.dealImage} /> : <View style={styles.dealImageFallback}><Text style={styles.code}>SA</Text></View>}
            <Text style={styles.dealTitle}>{salon.name}</Text>
            <Text style={styles.dealMeta}>{ratingText(salon)}{salon.distanceKm !== null && salon.distanceKm !== undefined ? ` | ${salon.distanceKm.toFixed(1)} km` : ""}</Text>
            <Text style={styles.dealPrice}>{serviceText(salon)}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <Text style={styles.section}>NEARBY SALONS</Text>
      {suggestedSalons.map((salon) => (
        <TouchableOpacity onPress={() => void openDetails(salon)} style={styles.salon} key={salon.id}>
          {salon.coverImageUrl ? <Image source={{ uri: apiAssetUrl(salon.coverImageUrl) }} style={styles.coverThumb} /> : <View style={styles.coverFallback}><Text style={styles.code}>SA</Text></View>}
          <View style={styles.salonCopy}>
            <Text style={styles.name}>{salon.name}</Text>
            <Text style={styles.rating}>{ratingText(salon)}{salon.distanceKm !== null && salon.distanceKm !== undefined ? `  |  ${salon.distanceKm.toFixed(1)} km` : ""}</Text>
            <Text style={styles.address}>{salon.address}</Text>
            <Text style={styles.meta}>{serviceText(salon)}</Text>
          </View>
          <TouchableOpacity onPress={() => void openMaps(salon)} style={styles.mapBadge}><Ionicons name="map-outline" size={19} color={colors.cyan} /></TouchableOpacity>
        </TouchableOpacity>
      ))}
    </KeyboardAwareScreen>
  );
}

function FilterRow({ values, active, onPress, styles }: { values: string[]; active: string; onPress: (value: string) => void; styles: ReturnType<typeof createStyles> }) {
  return <ScrollView horizontal showsHorizontalScrollIndicator={false}>{values.map((value, index) => <TouchableOpacity key={`${value}-${index}`} onPress={() => onPress(value)} style={[styles.filter, active === value && styles.filterActive]}><Text style={[styles.filterText, active === value && styles.filterTextActive]}>{value}</Text></TouchableOpacity>)}</ScrollView>;
}

function StepHeader({ number, title, done, optional = false, styles }: { number: string; title: string; done: boolean; optional?: boolean; styles: ReturnType<typeof createStyles> }) {
  return (
    <View style={styles.stepHeader}>
      <View style={[styles.stepDot, done && styles.stepDotDone]}><Text style={styles.stepDotText}>{done ? "✓" : number}</Text></View>
      <Text style={styles.stepTitle}>{title}</Text>
      {optional && <Text style={styles.optionalText}>OPTIONAL</Text>}
    </View>
  );
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

function serviceMatchesGender(service: Service, gender: GenderPreference) {
  const haystack = `${service.name} ${service.description ?? ""}`.toLowerCase();
  const keywords = gender === "M" ? menKeywords : womenKeywords;
  return keywords.some((keyword) => haystack.includes(keyword));
}

function salonMatchScore(salon: Salon, gender: GenderPreference) {
  const salonText = `${salon.name} ${salon.description ?? ""}`.toLowerCase();
  const keywords = gender === "M" ? menKeywords : womenKeywords;
  const salonScore = keywords.some((keyword) => salonText.includes(keyword)) ? 2 : 0;
  return salonScore + salon.services.filter((item) => serviceMatchesGender(item, gender)).length;
}

function sortSalonsForGender(salons: Salon[], gender: GenderPreference) {
  return [...salons].sort((left, right) => {
    const scoreDiff = salonMatchScore(right, gender) - salonMatchScore(left, gender);
    if (scoreDiff) return scoreDiff;
    return (left.distanceKm ?? Number.MAX_SAFE_INTEGER) - (right.distanceKm ?? Number.MAX_SAFE_INTEGER);
  });
}

function genderFilteredServices(salons: Salon[], gender: GenderPreference) {
  const matched = salons.flatMap((salon) => salon.services.filter((item) => serviceMatchesGender(item, gender)).map((item) => ({ ...item, salon })));
  if (matched.length) return matched;
  return salons.flatMap((salon) => salon.services.slice(0, 3).map((item) => ({ ...item, salon })));
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    page: { padding: 20, paddingBottom: 28 },
    clientTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 },
    locationTitleRow: { flexDirection: "row", alignItems: "center", gap: 7 },
    locationTitle: { color: colors.text, fontSize: 24, fontWeight: "900" },
    locationSub: { color: colors.muted, fontSize: 13, fontWeight: "700", marginTop: 6, maxWidth: 220 },
    headerActions: { flexDirection: "row", alignItems: "center", gap: 10 },
    genderToggle: { flexDirection: "row", alignItems: "center", width: 88, height: 44, padding: 3, borderWidth: 1, borderColor: colors.cyan, borderRadius: 8 },
    genderActive: { flex: 1, height: "100%", alignItems: "center", justifyContent: "center", borderRadius: 6, backgroundColor: colors.cyan },
    genderIdle: { flex: 1, height: "100%", alignItems: "center", justifyContent: "center" },
    genderActiveText: { color: colors.buttonText, fontSize: 18, fontWeight: "900" },
    genderIdleText: { color: colors.cyan, fontSize: 18, fontWeight: "900" },
    detectStrip: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, minHeight: 38, marginBottom: 12, borderRadius: 8, backgroundColor: colors.cyan },
    heroBanner: { minHeight: 190, flexDirection: "row", overflow: "hidden", borderRadius: 8, borderWidth: 1, borderColor: colors.heroBorder, backgroundColor: colors.panelRaised },
    heroCopy: { flex: 1.12, justifyContent: "center", padding: 22 },
    heroKicker: { color: colors.amber, fontSize: 10, fontWeight: "900", letterSpacing: 1.4 },
    heroTitle: { color: colors.text, fontSize: 29, fontWeight: "900", lineHeight: 36, marginTop: 10 },
    bookNowBadge: { alignSelf: "flex-start", marginTop: 18, paddingHorizontal: 15, paddingVertical: 9, borderRadius: 6, backgroundColor: colors.amber },
    bookNowText: { color: colors.background, fontSize: 16, fontWeight: "900" },
    heroImage: { width: 132, height: "100%", backgroundColor: colors.panel, resizeMode: "cover" },
    heroIllustration: { width: 132, alignItems: "center", justifyContent: "center", backgroundColor: colors.activePanel },
    promoStrip: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, marginTop: 10, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bar },
    promoStrong: { color: colors.text, fontSize: 15, fontWeight: "900" },
    promoText: { flex: 1, color: colors.text, fontSize: 13, fontWeight: "800" },
    sectionHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginTop: 28, marginBottom: 12 },
    sectionTitle: { color: colors.text, fontSize: 24, fontWeight: "900" },
    sectionSub: { color: colors.text, fontSize: 22, fontWeight: "800", marginTop: 4 },
    accentWord: { color: colors.cyan },
    seeAll: { color: colors.cyan, fontSize: 16, fontWeight: "800", paddingTop: 5 },
    serviceRail: { gap: 14, paddingRight: 20, paddingBottom: 8 },
    serviceTile: { width: 168, minHeight: 260, justifyContent: "space-between", padding: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.panel },
    serviceImage: { width: "100%", height: 112, borderRadius: 7, backgroundColor: colors.panelRaised },
    serviceImageFallback: { width: "100%", height: 112, alignItems: "center", justifyContent: "center", borderRadius: 7, backgroundColor: colors.activePanel },
    serviceName: { color: colors.text, fontSize: 17, fontWeight: "800", lineHeight: 21, marginTop: 10 },
    servicePrice: { color: colors.green, fontSize: 19, fontWeight: "900", marginTop: 10 },
    serviceBook: { minHeight: 42, alignItems: "center", justifyContent: "center", marginTop: 12, borderWidth: 1, borderColor: colors.cyan, borderRadius: 7 },
    serviceBookText: { color: colors.cyan, fontSize: 15, fontWeight: "900" },
    divider: { height: 8, marginHorizontal: -20, marginTop: 22, backgroundColor: colors.border, opacity: 0.45 },
    dealRail: { gap: 12, paddingRight: 20, paddingBottom: 8 },
    dealCard: { width: 210, padding: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.panel },
    dealImage: { width: "100%", height: 104, borderRadius: 7, backgroundColor: colors.panelRaised },
    dealImageFallback: { width: "100%", height: 104, alignItems: "center", justifyContent: "center", borderRadius: 7, backgroundColor: colors.panelRaised },
    dealTitle: { color: colors.text, fontSize: 15, fontWeight: "900", marginTop: 10 },
    dealMeta: { color: colors.amber, fontSize: 10, fontWeight: "800", marginTop: 6 },
    dealPrice: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 6 },
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
    bookingPanel: { padding: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.panel },
    bookingHero: { flexDirection: "row", alignItems: "center", gap: 12, padding: 13, marginBottom: 12, borderWidth: 1, borderColor: colors.heroBorder, borderRadius: 8, backgroundColor: colors.panelRaised },
    bookingHeroIcon: { width: 42, height: 42, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.cyan, borderRadius: 8, backgroundColor: colors.activePanel },
    bookingHeroTitle: { color: colors.text, fontSize: 15, fontWeight: "900" },
    bookingHeroMeta: { color: colors.muted, fontSize: 10, fontWeight: "800", marginTop: 5 },
    bookingHeroAmount: { color: colors.cyan, fontSize: 16, fontWeight: "900" },
    stepHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 14, marginBottom: 10 },
    stepDot: { width: 26, height: 26, alignItems: "center", justifyContent: "center", borderRadius: 13, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background },
    stepDotDone: { borderColor: colors.green, backgroundColor: colors.successPanel },
    stepDotText: { color: colors.text, fontSize: 11, fontWeight: "900" },
    stepTitle: { flex: 1, color: colors.text, fontSize: 13, fontWeight: "900" },
    optionalText: { color: colors.muted, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
    stepLabel: { color: colors.amber, fontSize: 10, fontWeight: "900", letterSpacing: 1.2, marginTop: 14, marginBottom: 10 },
    quickButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, minHeight: 42, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.cyan, borderRadius: 8, marginBottom: 10 },
    quickIconButton: { alignSelf: "flex-end", width: 44, height: 42, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.cyan, borderRadius: 8, marginBottom: 10, backgroundColor: colors.panel },
    bookingStack: { gap: 0 },
    bookingGrid: { flexDirection: "row", gap: 10 },
    bookingPicker: { flex: 1, padding: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.background, marginBottom: 10 },
    pickerLabel: { color: colors.muted, fontSize: 9, fontWeight: "900", letterSpacing: 1, marginBottom: 6 },
    pickerValue: { color: colors.text, fontSize: 15, fontWeight: "800" },
    pickerPlaceholder: { color: colors.placeholder, fontSize: 15, fontWeight: "700" },
    bookingInput: { color: colors.text, padding: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.background, fontSize: 13, marginBottom: 10 },
    addressInput: { minHeight: 64, textAlignVertical: "top" },
    instructionsInput: { minHeight: 78, textAlignVertical: "top" },
    selectedStrip: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 2, marginBottom: 2 },
    selectedPill: { paddingHorizontal: 10, paddingVertical: 7, borderWidth: 1, borderColor: colors.cyan, borderRadius: 999, backgroundColor: colors.activePanel },
    selectedPillText: { color: colors.cyan, fontSize: 10, fontWeight: "900" },
    bookingSummaryCard: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, padding: 14, marginTop: 4, marginBottom: 10, borderWidth: 1, borderColor: colors.heroBorder, borderRadius: 8, backgroundColor: colors.panelRaised },
    summaryTitle: { color: colors.muted, fontSize: 9, fontWeight: "900", letterSpacing: 1.2 },
    summaryLine: { color: colors.text, fontSize: 12, fontWeight: "800", marginTop: 8 },
    summaryAmount: { color: colors.cyan, fontSize: 20, fontWeight: "900", marginTop: 8 },
    confirmButton: { alignItems: "center", justifyContent: "center", minHeight: 50, paddingHorizontal: 14, backgroundColor: colors.cyan, marginTop: 4 },
    mapIconButton: { alignSelf: "flex-end", width: 48, height: 44, alignItems: "center", justifyContent: "center", marginTop: 10, borderRadius: 8, backgroundColor: colors.cyan },
    successBadge: { padding: 14, marginBottom: 10, borderWidth: 1, borderColor: colors.green, backgroundColor: colors.successPanel },
    successTitle: { color: colors.green, fontSize: 13, fontWeight: "900" },
    successText: { color: colors.text, fontSize: 11, fontWeight: "700", marginTop: 6 },
  });
}
