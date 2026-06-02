import * as Location from "expo-location";
import { useEffect, useState } from "react";
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { apiRequest } from "../../api/client";
import { colors } from "../../utils/theme";
import { ScreenHeader } from "../common/ScreenHeader";

type Coordinates = {
  latitude: number;
  longitude: number;
};

type Salon = {
  id: string;
  name: string;
  description?: string | null;
  address: string;
  latitude: number;
  longitude: number;
  rating?: number | null;
  reviewCount?: number;
  distanceKm?: number | null;
  services: Array<{ id: string; name: string; price: number }>;
};

const services = [["CUT", "Haircut", "From INR 499"], ["SPA", "Hair spa", "From INR 999"], ["SKN", "Skin care", "From INR 799"], ["BRD", "Grooming", "From INR 399"]];

export function ClientHomeScreen() {
  const [location, setLocation] = useState<Coordinates | null>(null);
  const [area, setArea] = useState("Detect your location");
  const [salons, setSalons] = useState<Salon[]>([]);
  const [loadingLocation, setLoadingLocation] = useState(false);
  const [loadingSalons, setLoadingSalons] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void loadSalons();
  }, []);

  async function loadSalons(nextLocation?: Coordinates) {
    setLoadingSalons(true);
    setError("");
    try {
      const query = nextLocation
        ? `?lat=${nextLocation.latitude}&lng=${nextLocation.longitude}&radiusKm=25`
        : "";
      setSalons(await apiRequest<Salon[]>(`/salons${query}`));
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
      const nextLocation = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };
      setLocation(nextLocation);

      const [place] = await Location.reverseGeocodeAsync(nextLocation);
      setArea([place?.district, place?.city, place?.region].filter(Boolean).slice(0, 2).join(", ") || "Current location");
      await loadSalons(nextLocation);
    } catch (locationError) {
      setError(locationError instanceof Error ? locationError.message : "Could not detect location");
    } finally {
      setLoadingLocation(false);
    }
  }

  async function openMaps(salon: Salon) {
    const destination = `${salon.latitude},${salon.longitude}`;
    const origin = location ? `&origin=${location.latitude},${location.longitude}` : "";
    const url = `https://www.google.com/maps/dir/?api=1${origin}&destination=${destination}&travelmode=driving`;
    await Linking.openURL(url);
  }

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <ScreenHeader eyebrow="SALON AT HOME // CLIENT" title="Nearby salons" subtitle="Find verified salon professionals around your current location." />
      <View style={styles.location}>
        <View>
          <Text style={styles.online}>{location ? "LOCATION ACTIVE" : "LOCATION REQUIRED"}</Text>
          <Text style={styles.locationText}>{area}</Text>
        </View>
        <TouchableOpacity disabled={loadingLocation} onPress={() => void detectLocation()} style={styles.detectButton}>
          {loadingLocation ? <ActivityIndicator color="#00202a" /> : <Text style={styles.detectText}>DETECT</Text>}
        </TouchableOpacity>
      </View>

      <View style={styles.hero}>
        <Text style={styles.heroTag}>DISTANCE-BASED DISCOVERY</Text>
        <Text style={styles.heroTitle}>See the closest verified salons first.</Text>
        <TouchableOpacity disabled={loadingLocation} style={styles.primary} onPress={() => void detectLocation()}><Text style={styles.primaryText}>FIND NEARBY</Text></TouchableOpacity>
      </View>

      {!!error && <Text style={styles.error}>{error}</Text>}

      <Text style={styles.section}>SERVICES</Text>
      <View style={styles.grid}>{services.map(([code, name, price]) => <View style={styles.service} key={code}><Text style={styles.code}>{code}</Text><Text style={styles.name}>{name}</Text><Text style={styles.meta}>{price}</Text></View>)}</View>

      <Text style={styles.section}>NEARBY SALONS</Text>
      {loadingSalons ? <ActivityIndicator color={colors.cyan} /> : null}
      {!loadingSalons && !salons.length ? <Text style={styles.empty}>No salons found nearby. Try detecting your location or increasing service coverage later.</Text> : null}
      {salons.map((salon) => (
        <TouchableOpacity onPress={() => void openMaps(salon)} style={styles.salon} key={salon.id}>
          <View style={styles.salonCopy}>
            <Text style={styles.name}>{salon.name}</Text>
            <Text style={styles.rating}>{ratingText(salon)}{salon.distanceKm !== null && salon.distanceKm !== undefined ? `  |  ${salon.distanceKm.toFixed(1)} km` : ""}</Text>
            <Text style={styles.address}>{salon.address}</Text>
            <Text style={styles.meta}>{serviceText(salon)}</Text>
          </View>
          <View style={styles.mapBadge}><Text style={styles.mapText}>MAP</Text></View>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

function ratingText(salon: Salon) {
  if (!salon.rating) return "NEW";
  return `RATING ${salon.rating.toFixed(1)} (${salon.reviewCount ?? 0})`;
}

function serviceText(salon: Salon) {
  if (!salon.services.length) return "Services coming soon";
  const cheapest = Math.min(...salon.services.map((service) => service.price));
  return `${salon.services.slice(0, 2).map((service) => service.name).join(", ")} | From INR ${cheapest}`;
}

const styles = StyleSheet.create({
  page: { padding: 20, paddingBottom: 28 },
  location: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, padding: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel },
  online: { color: colors.green, fontSize: 9, fontWeight: "800", letterSpacing: 1 },
  locationText: { color: colors.text, fontSize: 12, marginTop: 5 },
  detectButton: { minWidth: 76, alignItems: "center", justifyContent: "center", padding: 10, backgroundColor: colors.cyan },
  detectText: { color: "#00202a", fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  hero: { marginTop: 14, padding: 18, borderWidth: 1, borderColor: "#205063", backgroundColor: colors.panelRaised },
  heroTag: { color: colors.amber, fontSize: 9, letterSpacing: 1.8 },
  heroTitle: { color: colors.text, fontSize: 26, lineHeight: 32, fontWeight: "700", marginVertical: 14 },
  primary: { alignSelf: "flex-start", backgroundColor: colors.cyan, padding: 11 },
  primaryText: { color: "#00202a", fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  error: { color: "#ff7b73", fontSize: 11, marginTop: 14 },
  section: { color: colors.text, fontWeight: "700", fontSize: 12, letterSpacing: 1.5, marginTop: 24, marginBottom: 10 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  service: { width: "48%", padding: 13, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel },
  code: { color: colors.cyan, fontWeight: "800", fontSize: 9, letterSpacing: 1.4 },
  name: { color: colors.text, fontWeight: "700", fontSize: 14 },
  meta: { color: colors.muted, fontSize: 10, marginTop: 6 },
  salon: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel },
  salonCopy: { flex: 1 },
  rating: { color: colors.amber, fontSize: 10, marginTop: 6 },
  address: { color: colors.text, fontSize: 11, lineHeight: 16, marginTop: 7 },
  mapBadge: { width: 42, height: 42, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.cyan },
  mapText: { color: colors.cyan, fontSize: 9, fontWeight: "900" },
  empty: { color: colors.muted, fontSize: 12, lineHeight: 18 },
});
