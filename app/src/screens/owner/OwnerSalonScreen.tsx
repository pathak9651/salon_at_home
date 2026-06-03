import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { apiAssetUrl, API_URL, apiRequest } from "../../api/client";
import { ThemeColors, useTheme } from "../../utils/theme";
import { KeyboardAwareScreen } from "../common/KeyboardAwareScreen";
import { ScreenHeader } from "../common/ScreenHeader";

type Service = { id: string; name: string; description?: string | null; price: number; durationMin: number };
type Employee = {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  roleTitle?: string | null;
  specialties?: string | null;
  isActive: boolean;
  salonId: string;
  salon?: { id: string; name: string };
};
type Salon = {
  id: string;
  name: string;
  description?: string | null;
  address: string;
  latitude: number;
  longitude: number;
  imageUrl?: string | null;
  isVerified: boolean;
  images: Array<{ id: string; url: string; caption?: string | null }>;
  services: Service[];
  owner?: { name?: string | null; phone: string; email?: string | null; emailVerified: boolean };
};
type Profile = { name?: string | null; phone: string; email?: string | null; emailVerified: boolean };

const emptySalonForm = { name: "", description: "", address: "", latitude: "", longitude: "" };
const emptyServiceForm = { name: "", description: "", price: "", durationMin: "" };
const emptyEmployeeForm = { name: "", phone: "", email: "", roleTitle: "", specialties: "" };

export function OwnerSalonScreen({ token }: { token: string }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const [salons, setSalons] = useState<Salon[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [detectingLocation, setDetectingLocation] = useState(false);
  const [salonForm, setSalonForm] = useState(emptySalonForm);
  const [salonImages, setSalonImages] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [serviceForms, setServiceForms] = useState<Record<string, typeof emptyServiceForm>>({});
  const [employeeForms, setEmployeeForms] = useState<Record<string, typeof emptyEmployeeForm>>({});
  const [editingService, setEditingService] = useState<{ salonId: string; serviceId: string } | null>(null);
  const [editingEmployee, setEditingEmployee] = useState<{ salonId: string; employeeId: string } | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const [nextSalons, nextProfile, nextEmployees] = await Promise.all([
        apiRequest<Salon[]>("/salons/mine", { headers: { Authorization: `Bearer ${token}` } }),
        apiRequest<Profile>("/profile", { headers: { Authorization: `Bearer ${token}` } }),
        apiRequest<Employee[]>("/employees", { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      setSalons(nextSalons);
      setProfile(nextProfile);
      setEmployees(nextEmployees);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load salon workspace");
    } finally {
      setLoading(false);
    }
  }

  async function pickSalonImages() {
    setNotice("");
    setError("");
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return setError("Allow photo access to upload salon images.");
    const result = await ImagePicker.launchImageLibraryAsync({ allowsMultipleSelection: true, mediaTypes: ["images"], quality: 0.82, selectionLimit: 5 });
    if (!result.canceled) setSalonImages(result.assets.slice(0, 5));
  }

  async function detectSalonAddress() {
    setDetectingLocation(true);
    setNotice("");
    setError("");
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) throw new Error("Allow location access to detect the salon address.");
      const position = await Location.getCurrentPositionAsync({});
      const places = await Location.reverseGeocodeAsync(position.coords);
      const place = places[0];
      const address = [place?.name, place?.street, place?.district, place?.city, place?.region, place?.postalCode].filter(Boolean).join(", ");
      setSalonForm((current) => ({
        ...current,
        address: address || current.address,
        latitude: position.coords.latitude.toFixed(6),
        longitude: position.coords.longitude.toFixed(6),
      }));
      setNotice("Location detected. Review the salon address before registering.");
    } catch (locationError) {
      setError(locationError instanceof Error ? locationError.message : "Could not detect salon location");
    } finally {
      setDetectingLocation(false);
    }
  }

  async function uploadSalonImage(salonId: string, asset: ImagePicker.ImagePickerAsset) {
    const image = await fetch(asset.uri);
    const body = await image.blob();
    const response = await fetch(`${API_URL}/salons/${salonId}/images/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": asset.mimeType ?? "image/jpeg" },
      body,
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      throw new Error(payload?.error ?? "Could not upload salon image");
    }
  }

  async function registerSalon() {
    setSaving(true);
    setNotice("");
    setError("");
    try {
      if (!salonForm.name.trim()) throw new Error("Add the salon name");
      if (!salonForm.address.trim()) throw new Error("Add the salon address");
      if (!salonForm.latitude.trim() || !salonForm.longitude.trim()) throw new Error("Add latitude and longitude or auto-detect location");
      const created = await apiRequest<Salon>("/salons", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...salonForm, latitude: Number(salonForm.latitude), longitude: Number(salonForm.longitude) }),
      });
      for (const image of salonImages) await uploadSalonImage(created.id, image);
      setSalonForm(emptySalonForm);
      setSalonImages([]);
      setNotice("Salon registered successfully. Admin verification is pending.");
      await loadData();
    } catch (registerError) {
      setError(registerError instanceof Error ? registerError.message : "Could not register salon");
    } finally {
      setSaving(false);
    }
  }

  function serviceFormFor(salonId: string) {
    return serviceForms[salonId] ?? emptyServiceForm;
  }

  function updateServiceForm(salonId: string, patch: Partial<typeof emptyServiceForm>) {
    setServiceForms((current) => ({ ...current, [salonId]: { ...serviceFormFor(salonId), ...patch } }));
  }

  function startEditService(salonId: string, service: Service) {
    setEditingService({ salonId, serviceId: service.id });
    setServiceForms((current) => ({
      ...current,
      [salonId]: { name: service.name, description: service.description ?? "", price: String(service.price), durationMin: String(service.durationMin) },
    }));
  }

  async function saveService(salonId: string) {
    const form = serviceFormFor(salonId);
    setSaving(true);
    setNotice("");
    setError("");
    try {
      if (!form.name.trim()) throw new Error("Add service name");
      if (!form.price.trim()) throw new Error("Set service price");
      if (!form.durationMin.trim()) throw new Error("Set service duration");
      const activeEdit = editingService?.salonId === salonId ? editingService.serviceId : null;
      const path = activeEdit ? `/salons/${salonId}/services/${activeEdit}` : `/salons/${salonId}/services`;
      await apiRequest(path, {
        method: activeEdit ? "PATCH" : "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...form, price: Number(form.price), durationMin: Number(form.durationMin) }),
      });
      setEditingService(null);
      setServiceForms((current) => ({ ...current, [salonId]: emptyServiceForm }));
      setNotice(activeEdit ? "Service updated." : "Service added.");
      await loadData();
    } catch (serviceError) {
      setError(serviceError instanceof Error ? serviceError.message : "Could not save service");
    } finally {
      setSaving(false);
    }
  }

  async function deleteService(salonId: string, serviceId: string) {
    setSaving(true);
    setNotice("");
    setError("");
    try {
      await apiRequest(`/salons/${salonId}/services/${serviceId}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      setNotice("Service deleted.");
      await loadData();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not delete service");
    } finally {
      setSaving(false);
    }
  }

  function employeeFormFor(salonId: string) {
    return employeeForms[salonId] ?? emptyEmployeeForm;
  }

  function updateEmployeeForm(salonId: string, patch: Partial<typeof emptyEmployeeForm>) {
    setEmployeeForms((current) => ({ ...current, [salonId]: { ...employeeFormFor(salonId), ...patch } }));
  }

  function startEditEmployee(salonId: string, employee: Employee) {
    setEditingEmployee({ salonId, employeeId: employee.id });
    setEmployeeForms((current) => ({
      ...current,
      [salonId]: {
        name: employee.name,
        phone: employee.phone ?? "",
        email: employee.email ?? "",
        roleTitle: employee.roleTitle ?? "",
        specialties: employee.specialties ?? "",
      },
    }));
  }

  async function saveEmployee(salonId: string) {
    const form = employeeFormFor(salonId);
    setSaving(true);
    setNotice("");
    setError("");
    try {
      if (!form.name.trim()) throw new Error("Add employee name");
      const activeEdit = editingEmployee?.salonId === salonId ? editingEmployee.employeeId : null;
      await apiRequest(activeEdit ? `/employees/${activeEdit}` : "/employees", {
        method: activeEdit ? "PATCH" : "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...form, salonId, isActive: true }),
      });
      setEditingEmployee(null);
      setEmployeeForms((current) => ({ ...current, [salonId]: emptyEmployeeForm }));
      setNotice(activeEdit ? "Employee updated." : "Employee added.");
      await loadData();
    } catch (employeeError) {
      setError(employeeError instanceof Error ? employeeError.message : "Could not save employee");
    } finally {
      setSaving(false);
    }
  }

  async function deleteEmployee(employeeId: string) {
    setSaving(true);
    setNotice("");
    setError("");
    try {
      await apiRequest(`/employees/${employeeId}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      setNotice("Employee removed or marked inactive.");
      await loadData();
    } catch (employeeError) {
      setError(employeeError instanceof Error ? employeeError.message : "Could not remove employee");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.cyan} /></View>;

  return (
    <KeyboardAwareScreen contentContainerStyle={styles.page}>
      <ScreenHeader eyebrow="PARTNER CONSOLE // SALON" title="Salon setup" subtitle="Register your salon, upload images, and manage services." />
      {!!notice && <Text style={styles.notice}>{notice}</Text>}
      {!!error && <Text style={styles.error}>{error}</Text>}

      <Text style={styles.section}>SALON REGISTRATION</Text>
      <View style={styles.formCard}>
        <View style={styles.contactPanel}>
          <Text style={styles.label}>CONTACT INFORMATION</Text>
          <Text style={styles.contactText}>{profile?.name ?? "Owner"} | {profile?.phone ?? "Phone not added"}</Text>
          <Text style={profile?.emailVerified ? styles.verified : styles.pending}>{profile?.emailVerified ? "EMAIL VERIFIED" : "EMAIL VERIFICATION PENDING"}</Text>
        </View>
        <TextInput value={salonForm.name} onChangeText={(name) => setSalonForm((current) => ({ ...current, name }))} placeholder="Salon name" placeholderTextColor={colors.placeholder} style={styles.input} />
        <TextInput value={salonForm.description} onChangeText={(description) => setSalonForm((current) => ({ ...current, description }))} placeholder="Salon details and specialties" placeholderTextColor={colors.placeholder} style={[styles.input, styles.textArea]} multiline />
        <View style={styles.addressRow}>
          <TextInput value={salonForm.address} onChangeText={(address) => setSalonForm((current) => ({ ...current, address }))} placeholder="Salon address" placeholderTextColor={colors.placeholder} style={[styles.input, styles.addressInput]} multiline />
          <TouchableOpacity accessibilityLabel="Auto detect salon location" disabled={detectingLocation} onPress={() => void detectSalonAddress()} style={styles.locationButton}>
            {detectingLocation ? <ActivityIndicator color={colors.cyan} /> : <Ionicons name="locate" size={22} color={colors.cyan} />}
          </TouchableOpacity>
        </View>
        <View style={styles.twoColumns}>
          <TextInput value={salonForm.latitude} onChangeText={(latitude) => setSalonForm((current) => ({ ...current, latitude }))} placeholder="Latitude" placeholderTextColor={colors.placeholder} keyboardType="decimal-pad" style={styles.input} />
          <TextInput value={salonForm.longitude} onChangeText={(longitude) => setSalonForm((current) => ({ ...current, longitude }))} placeholder="Longitude" placeholderTextColor={colors.placeholder} keyboardType="decimal-pad" style={styles.input} />
        </View>
        <View style={styles.actions}>
          <TouchableOpacity onPress={() => void pickSalonImages()} style={styles.action}><Text style={styles.link}>ADD IMAGES</Text></TouchableOpacity>
          <TouchableOpacity disabled={saving} onPress={() => void registerSalon()} style={styles.primary}><Text style={styles.primaryText}>{saving ? "SAVING" : "REGISTER"}</Text></TouchableOpacity>
        </View>
        {salonImages.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.previewStrip}>{salonImages.map((image) => <Image key={image.uri} source={{ uri: image.uri }} style={styles.previewImage} />)}</ScrollView> : null}
      </View>

      <Text style={styles.section}>SERVICE MANAGEMENT</Text>
      {salons.length ? salons.map((salon) => {
        const form = serviceFormFor(salon.id);
        const employeeForm = employeeFormFor(salon.id);
        const salonEmployees = employees.filter((employee) => employee.salonId === salon.id);
        return (
          <View style={styles.salonCard} key={salon.id}>
            <View style={styles.salonTop}>
              {salon.imageUrl || salon.images[0]?.url ? <Image source={{ uri: apiAssetUrl(salon.imageUrl ?? salon.images[0]?.url) }} style={styles.salonThumb} /> : <View style={styles.salonFallback}><Text style={styles.code}>SA</Text></View>}
              <View style={styles.copy}>
                <Text style={styles.name}>{salon.name}</Text>
                <Text style={salon.isVerified ? styles.verified : styles.pending}>{salon.isVerified ? "SALON VERIFIED" : "ADMIN VERIFICATION PENDING"}</Text>
                <Text style={styles.meta}>{salon.address}</Text>
                <Text style={styles.meta}>{salon.images.length} image(s) | {salon.services.length} service(s)</Text>
              </View>
            </View>
            {salon.services.map((service) => (
              <View style={styles.serviceRow} key={service.id}>
                <View style={styles.copy}>
                  <Text style={styles.serviceName}>{service.name}</Text>
                  {!!service.description && <Text style={styles.meta}>{service.description}</Text>}
                  <Text style={styles.meta}>INR {service.price} | {service.durationMin} min</Text>
                </View>
                <TouchableOpacity onPress={() => startEditService(salon.id, service)} style={styles.smallAction}><Text style={styles.link}>EDIT</Text></TouchableOpacity>
                <TouchableOpacity onPress={() => Alert.alert("Delete service?", "This service will be removed if it has no bookings.", [{ text: "Cancel" }, { text: "Delete", style: "destructive", onPress: () => void deleteService(salon.id, service.id) }])} style={styles.smallAction}><Text style={styles.deleteLink}>DEL</Text></TouchableOpacity>
              </View>
            ))}
            <View style={styles.serviceForm}>
              <TextInput value={form.name} onChangeText={(name) => updateServiceForm(salon.id, { name })} placeholder="Service name" placeholderTextColor={colors.placeholder} style={styles.input} />
              <TextInput value={form.description} onChangeText={(description) => updateServiceForm(salon.id, { description })} placeholder="Service description" placeholderTextColor={colors.placeholder} style={styles.input} />
              <View style={styles.twoColumns}>
                <TextInput value={form.price} onChangeText={(price) => updateServiceForm(salon.id, { price })} placeholder="Price" placeholderTextColor={colors.placeholder} keyboardType="number-pad" style={styles.input} />
                <TextInput value={form.durationMin} onChangeText={(durationMin) => updateServiceForm(salon.id, { durationMin })} placeholder="Duration min" placeholderTextColor={colors.placeholder} keyboardType="number-pad" style={styles.input} />
              </View>
              <TouchableOpacity disabled={saving} onPress={() => void saveService(salon.id)} style={styles.primary}><Text style={styles.primaryText}>{editingService?.salonId === salon.id ? "SAVE SERVICE" : "ADD SERVICE"}</Text></TouchableOpacity>
            </View>

            <Text style={styles.subsection}>EMPLOYEES / STYLISTS</Text>
            {salonEmployees.length ? salonEmployees.map((employee) => (
              <View style={styles.serviceRow} key={employee.id}>
                <View style={styles.copy}>
                  <Text style={styles.serviceName}>{employee.name}</Text>
                  <Text style={employee.isActive ? styles.verified : styles.pending}>{employee.isActive ? "ACTIVE" : "INACTIVE"}</Text>
                  <Text style={styles.meta}>{[employee.roleTitle, employee.specialties].filter(Boolean).join(" | ") || "Stylist details not added"}</Text>
                  <Text style={styles.meta}>{[employee.phone, employee.email].filter(Boolean).join(" | ")}</Text>
                </View>
                <TouchableOpacity onPress={() => startEditEmployee(salon.id, employee)} style={styles.smallAction}><Text style={styles.link}>EDIT</Text></TouchableOpacity>
                <TouchableOpacity onPress={() => Alert.alert("Remove employee?", "Employees with bookings will be marked inactive.", [{ text: "Cancel" }, { text: "Remove", style: "destructive", onPress: () => void deleteEmployee(employee.id) }])} style={styles.smallAction}><Text style={styles.deleteLink}>DEL</Text></TouchableOpacity>
              </View>
            )) : <Text style={styles.empty}>No employees added yet.</Text>}
            <View style={styles.serviceForm}>
              <TextInput value={employeeForm.name} onChangeText={(name) => updateEmployeeForm(salon.id, { name })} placeholder="Employee name" placeholderTextColor={colors.placeholder} style={styles.input} />
              <View style={styles.twoColumns}>
                <TextInput value={employeeForm.phone} onChangeText={(phone) => updateEmployeeForm(salon.id, { phone })} placeholder="Phone" placeholderTextColor={colors.placeholder} keyboardType="phone-pad" style={styles.input} />
                <TextInput value={employeeForm.email} onChangeText={(email) => updateEmployeeForm(salon.id, { email })} placeholder="Email" placeholderTextColor={colors.placeholder} keyboardType="email-address" autoCapitalize="none" style={styles.input} />
              </View>
              <TextInput value={employeeForm.roleTitle} onChangeText={(roleTitle) => updateEmployeeForm(salon.id, { roleTitle })} placeholder="Role title, e.g. Senior stylist" placeholderTextColor={colors.placeholder} style={styles.input} />
              <TextInput value={employeeForm.specialties} onChangeText={(specialties) => updateEmployeeForm(salon.id, { specialties })} placeholder="Specialties" placeholderTextColor={colors.placeholder} style={styles.input} />
              <TouchableOpacity disabled={saving} onPress={() => void saveEmployee(salon.id)} style={styles.primary}><Text style={styles.primaryText}>{editingEmployee?.salonId === salon.id ? "SAVE EMPLOYEE" : "ADD EMPLOYEE"}</Text></TouchableOpacity>
            </View>
          </View>
        );
      }) : <Text style={styles.empty}>Register a salon before adding services.</Text>}
    </KeyboardAwareScreen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    center: { flex: 1, alignItems: "center", justifyContent: "center" },
    page: { padding: 20, paddingBottom: 34 },
    section: { color: colors.text, fontSize: 12, fontWeight: "800", letterSpacing: 1.4, marginTop: 24, marginBottom: 10 },
    notice: { color: colors.green, fontSize: 11, marginTop: 14 },
    error: { color: colors.danger, fontSize: 11, marginTop: 14 },
    formCard: { padding: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.panel },
    contactPanel: { padding: 12, marginBottom: 10, borderWidth: 1, borderColor: colors.heroBorder, borderRadius: 8, backgroundColor: colors.panelRaised },
    contactText: { color: colors.text, fontSize: 12, fontWeight: "700", lineHeight: 18 },
    label: { color: colors.muted, fontSize: 9, fontWeight: "800", letterSpacing: 1, marginBottom: 7 },
    verified: { color: colors.green, fontSize: 9, fontWeight: "900", letterSpacing: 1, marginTop: 7 },
    pending: { color: colors.amber, fontSize: 9, fontWeight: "900", letterSpacing: 1, marginTop: 7 },
    input: { flex: 1, color: colors.text, minHeight: 42, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.panelRaised, fontSize: 12 },
    textArea: { minHeight: 74, textAlignVertical: "top" },
    addressRow: { flexDirection: "row", alignItems: "stretch", gap: 8 },
    addressInput: { minHeight: 70, textAlignVertical: "top" },
    locationButton: { width: 46, height: 46, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.cyan, borderRadius: 8, backgroundColor: colors.panelRaised },
    twoColumns: { flexDirection: "row", gap: 8 },
    actions: { flexDirection: "row", gap: 8, marginTop: 2 },
    primary: { flex: 1, alignItems: "center", justifyContent: "center", minHeight: 42, paddingHorizontal: 12, borderRadius: 8, backgroundColor: colors.cyan },
    primaryText: { color: colors.buttonText, fontWeight: "900", fontSize: 10, letterSpacing: 1 },
    action: { flex: 1, alignItems: "center", justifyContent: "center", minHeight: 42, paddingHorizontal: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 8 },
    link: { color: colors.cyan, fontSize: 10, fontWeight: "900", letterSpacing: 1 },
    deleteLink: { color: colors.danger, fontSize: 10, fontWeight: "900", letterSpacing: 1 },
    previewStrip: { marginTop: 10 },
    previewImage: { width: 78, height: 78, marginRight: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.panelRaised },
    salonCard: { padding: 12, marginBottom: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.panel },
    salonTop: { flexDirection: "row", gap: 12, marginBottom: 12 },
    salonThumb: { width: 72, height: 72, borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.panelRaised },
    salonFallback: { width: 72, height: 72, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.panelRaised },
    code: { color: colors.cyan, fontSize: 13, fontWeight: "900" },
    copy: { flex: 1 },
    name: { color: colors.text, fontSize: 14, fontWeight: "800", marginTop: 2 },
    meta: { color: colors.muted, fontSize: 10, marginTop: 6, lineHeight: 15 },
    serviceRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border },
    subsection: { color: colors.text, fontSize: 11, fontWeight: "900", letterSpacing: 1.1, marginTop: 16, marginBottom: 6 },
    serviceName: { color: colors.text, fontSize: 13, fontWeight: "800" },
    smallAction: { minWidth: 44, minHeight: 36, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 8 },
    serviceForm: { marginTop: 10, padding: 12, borderWidth: 1, borderColor: colors.heroBorder, borderRadius: 8, backgroundColor: colors.panelRaised },
    empty: { color: colors.muted, fontSize: 12, paddingVertical: 8 },
  });
}
