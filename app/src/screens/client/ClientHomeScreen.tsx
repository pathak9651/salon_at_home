import * as Location from "expo-location";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Image, Linking, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { apiRequest } from "../../api/client";
import { ThemeColors, useTheme } from "../../utils/theme";
import { ScreenHeader } from "../common/ScreenHeader";

type Coordinates = { latitude: number; longitude: number };
type Service = { id: string; name: string; description?: string | null; price: number; durationMin: number };
type SalonImage = { id: string; url: string; caption?: string | null };
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
};

const serviceFilters = ["Haircut", "Hair spa", "Skin care", "Grooming"];
const ratingFilters = [0, 3, 4, 4.5];
const distanceFilters = [5, 10, 25, 50];
const priceFilters = [0, 500, 1000, 2000];

export function ClientHomeScreen() {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const [location, setLocation] = useState<Coordinates | null>(null);
  const [area, setArea] = useState("Detect your location");
  const [salons, setSalons] = useState<Salon[]>([]);
  const [selectedSalon, setSelectedSalon] = useState<Salon | null>(null);
  const [search, setSearch] = useState("");
  const [service, setService] = useState("");
  const [minRating, setMinRating] = useState(0);
  const [radiusKm, setRadiusKm] = useState(25);
  const [maxPrice, setMaxPrice] = useState(0);
  const [showFilters, setShowFilters] = useState(false);
  const [loadingLocation, setLoadingLocation] = useState(false);
  const [loadingSalons, setLoadingSalons] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);
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

  const activeFilterCount = (radiusKm !== 25 ? 1 : 0) + (minRating ? 1 : 0) + (maxPrice ? 1 : 0) + (service ? 1 : 0);

  if (selectedSalon) {
    const gallery = [selectedSalon.coverImageUrl, selectedSalon.imageUrl, ...selectedSalon.images.map((image) => image.url)].filter(Boolean) as string[];
    return (
      <ScrollView contentContainerStyle={styles.page}>
        <TouchableOpacity onPress={() => setSelectedSalon(null)} style={styles.secondary}><Text style={styles.secondaryText}>BACK TO SALONS</Text></TouchableOpacity>
        <Text style={styles.detailTitle}>{selectedSalon.name}</Text>
        <Text style={styles.rating}>{ratingText(selectedSalon)}{selectedSalon.distanceKm !== null && selectedSalon.distanceKm !== undefined ? `  |  ${selectedSalon.distanceKm.toFixed(1)} km` : ""}</Text>
        <Text style={styles.address}>{selectedSalon.address}</Text>
        {!!selectedSalon.description && <Text style={styles.description}>{selectedSalon.description}</Text>}
        {loadingDetails ? <ActivityIndicator color={colors.cyan} /> : null}

        <Text style={styles.section}>SALON IMAGES</Text>
        {gallery.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false}>{gallery.map((url, index) => <Image key={`${url}-${index}`} source={{ uri: url }} style={styles.galleryImage} />)}</ScrollView> : <View style={styles.imagePlaceholder}><Text style={styles.empty}>No images uploaded yet.</Text></View>}

        <Text style={styles.section}>AVAILABLE SERVICES</Text>
        {selectedSalon.services.length ? selectedSalon.services.map((item) => (
          <View style={styles.serviceRow} key={item.id}>
            <View style={styles.salonCopy}>
              <Text style={styles.name}>{item.name}</Text>
              {!!item.description && <Text style={styles.meta}>{item.description}</Text>}
              <Text style={styles.meta}>{item.durationMin} min</Text>
            </View>
            <Text style={styles.charge}>INR {item.price}</Text>
          </View>
        )) : <Text style={styles.empty}>No services listed.</Text>}
        <TouchableOpacity onPress={() => void openMaps(selectedSalon)} style={styles.primary}><Text style={styles.primaryText}>OPEN IN GOOGLE MAPS</Text></TouchableOpacity>
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
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
    </ScrollView>
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
    serviceRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel },
    charge: { color: colors.cyan, fontSize: 13, fontWeight: "900" },
  });
}
