import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { ThemeColors, useTheme } from "../../utils/theme";

const onboardingPages = [
  {
    kicker: "WELCOME TO BARBERX",
    title: "BarberX salon welcoming you",
    subtitle: "Book trusted salon experts at home, manage visits, and pay securely after service completion.",
  },
  {
    kicker: "AT HOME SERVICES",
    title: "Salon care arrives at your doorstep",
    subtitle: "Use saved addresses, live location, and quick slots to book a clean home-service experience.",
  },
  {
    kicker: "SECURE CHECKOUT",
    title: "Pay only after the service is complete",
    subtitle: "Online invoices, cash confirmations, and payment history stay clear for clients, merchants, and admin.",
  },
];

export function WelcomeScreen({ onGetStarted }: { onGetStarted: () => void }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const [pageIndex, setPageIndex] = useState(0);
  const sweep = useRef(new Animated.Value(0)).current;
  const float = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const sweepLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(sweep, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
        Animated.timing(sweep, { toValue: 0, duration: 1800, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
      ]),
    );
    const floatLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(float, { toValue: 1, duration: 1300, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(float, { toValue: 0, duration: 1300, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    sweepLoop.start();
    floatLoop.start();
    return () => {
      sweepLoop.stop();
      floatLoop.stop();
    };
  }, [float, sweep]);

  const scissorsRotate = sweep.interpolate({ inputRange: [0, 1], outputRange: ["-18deg", "18deg"] });
  const scissorsX = sweep.interpolate({ inputRange: [0, 1], outputRange: [-18, 18] });
  const shimmerX = sweep.interpolate({ inputRange: [0, 1], outputRange: [-80, 110] });
  const badgeBob = float.interpolate({ inputRange: [0, 1], outputRange: [-5, 7] });
  const shineOpacity = float.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.85] });
  const pulseScale = float.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1.06] });
  const routeProgress = sweep.interpolate({ inputRange: [0, 1], outputRange: [-30, 72] });
  const currentPage = onboardingPages[pageIndex];
  const isLastPage = pageIndex === onboardingPages.length - 1;

  function goNext() {
    if (isLastPage) {
      onGetStarted();
      return;
    }
    setPageIndex((current) => Math.min(current + 1, onboardingPages.length - 1));
  }

  return (
    <View style={styles.page}>
      <View style={styles.topBadge}>
        <Ionicons name="sparkles-outline" size={16} color={colors.cyan} />
        <Text style={styles.topBadgeText}>BARBERX SALON</Text>
      </View>

      <View style={styles.stage}>
        {pageIndex === 0 && <>
          <View style={styles.backdropPanel} />
          <View style={styles.salonSign}>
            <Ionicons name="storefront-outline" size={18} color={colors.cyan} />
            <Text style={styles.salonSignText}>BARBERX</Text>
          </View>
          <Animated.View style={[styles.shineLine, { opacity: shineOpacity }]} />
          <Animated.View style={[styles.offerBubble, styles.offerBubbleLeft, { transform: [{ translateY: badgeBob }] }]}>
            <Ionicons name="cut-outline" size={18} color={colors.amber} />
            <Text style={styles.offerText}>At home</Text>
          </Animated.View>
          <Animated.View style={[styles.offerBubble, styles.offerBubbleRight, { transform: [{ translateY: badgeBob }] }]}>
            <Ionicons name="time-outline" size={18} color={colors.green} />
            <Text style={styles.offerText}>Fast slots</Text>
          </Animated.View>

          <View style={styles.salonFloor} />
          <View style={styles.mirrorWrap}>
            <View style={styles.mirror}>
              <Animated.View style={[styles.mirrorShimmer, { transform: [{ translateX: shimmerX }] }]} />
            </View>
            <View style={styles.shelf}>
              <View style={styles.bottleTall} />
              <View style={styles.bottleSmall} />
            </View>
          </View>

          <View style={styles.chairWrap}>
            <View style={styles.chairBack}>
              <View style={styles.clientHead} />
              <View style={styles.clientCape} />
            </View>
            <View style={styles.chairSeat} />
            <View style={styles.chairStem} />
            <View style={styles.chairBase} />
          </View>

          <View style={styles.barberPole}>
            <View style={styles.poleCap} />
            <Animated.View style={[styles.poleStripeOne, { transform: [{ translateY: badgeBob }, { rotate: "-24deg" }] }]} />
            <Animated.View style={[styles.poleStripeTwo, { transform: [{ translateY: badgeBob }, { rotate: "-24deg" }] }]} />
            <View style={styles.poleCapBottom} />
          </View>

          <Animated.View style={[styles.scissorsTool, { transform: [{ translateX: scissorsX }, { rotate: scissorsRotate }] }]}>
            <View style={styles.scissorHandleOne} />
            <View style={styles.scissorHandleTwo} />
            <View style={styles.scissorBladeOne} />
            <View style={styles.scissorBladeTwo} />
            <View style={styles.scissorPin} />
          </Animated.View>

          <Animated.View style={[styles.sparkleOne, { opacity: shineOpacity, transform: [{ translateY: badgeBob }] }]}>
            <Ionicons name="sparkles" size={18} color={colors.amber} />
          </Animated.View>
          <Animated.View style={[styles.sparkleTwo, { opacity: shineOpacity }]}>
            <Ionicons name="sparkles" size={14} color={colors.cyan} />
          </Animated.View>
        </>}

        {pageIndex === 1 && <HomeVisitAnimation styles={styles} colors={colors} badgeBob={badgeBob} pulseScale={pulseScale} routeProgress={routeProgress} />}
        {pageIndex === 2 && <PaymentAnimation styles={styles} colors={colors} badgeBob={badgeBob} pulseScale={pulseScale} shineOpacity={shineOpacity} />}
      </View>

      <View style={styles.copy}>
        <Text style={styles.kicker}>{currentPage.kicker}</Text>
        <Text style={styles.title}>{currentPage.title}</Text>
        <Text style={styles.subtitle}>{currentPage.subtitle}</Text>
      </View>

      <View style={styles.footer}>
        <View style={styles.dots}>
          {onboardingPages.map((_, index) => <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Show welcome page ${index + 1}`} key={index} onPress={() => setPageIndex(index)} style={[styles.dot, pageIndex === index && styles.dotActive]} />)}
        </View>
        <TouchableOpacity accessibilityRole="button" onPress={goNext} style={styles.primary}>
          <Text style={styles.primaryText}>{isLastPage ? "GET STARTED" : "NEXT"}</Text>
          <Ionicons name={isLastPage ? "arrow-forward" : "chevron-forward"} size={18} color={colors.buttonText} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function HomeVisitAnimation({
  styles,
  colors,
  badgeBob,
  pulseScale,
  routeProgress,
}: {
  styles: ReturnType<typeof createStyles>;
  colors: ThemeColors;
  badgeBob: Animated.AnimatedInterpolation<number>;
  pulseScale: Animated.AnimatedInterpolation<number>;
  routeProgress: Animated.AnimatedInterpolation<number>;
}) {
  return (
    <>
      <View style={styles.homeMapPanel}>
        <View style={styles.mapLineOne} />
        <View style={styles.mapLineTwo} />
        <View style={styles.routeTrack} />
        <Animated.View style={[styles.routePulse, { transform: [{ translateX: routeProgress }] }]} />
      </View>
      <Animated.View style={[styles.homePin, { transform: [{ scale: pulseScale }] }]}>
        <Ionicons name="home" size={34} color={colors.buttonText} />
      </Animated.View>
      <Animated.View style={[styles.expertBadge, { transform: [{ translateY: badgeBob }] }]}>
        <Ionicons name="person-circle-outline" size={20} color={colors.cyan} />
        <Text style={styles.expertText}>Expert assigned</Text>
      </Animated.View>
      <View style={styles.homeCard}>
        <Ionicons name="location-outline" size={20} color={colors.amber} />
        <View style={styles.homeCardCopy}>
          <Text style={styles.homeCardTitle}>Saved address</Text>
          <Text style={styles.homeCardText}>Sector 3, Home visit</Text>
        </View>
        <Ionicons name="checkmark-circle" size={22} color={colors.green} />
      </View>
      <View style={styles.slotCard}>
        <Ionicons name="calendar-outline" size={18} color={colors.cyan} />
        <Text style={styles.slotText}>Next slot ready</Text>
      </View>
    </>
  );
}

function PaymentAnimation({
  styles,
  colors,
  badgeBob,
  pulseScale,
  shineOpacity,
}: {
  styles: ReturnType<typeof createStyles>;
  colors: ThemeColors;
  badgeBob: Animated.AnimatedInterpolation<number>;
  pulseScale: Animated.AnimatedInterpolation<number>;
  shineOpacity: Animated.AnimatedInterpolation<number>;
}) {
  return (
    <>
      <Animated.View style={[styles.paymentShield, { transform: [{ scale: pulseScale }] }]}>
        <Ionicons name="shield-checkmark" size={48} color={colors.buttonText} />
      </Animated.View>
      <View style={styles.invoiceCard}>
        <View style={styles.invoiceTop}>
          <Ionicons name="receipt-outline" size={24} color={colors.cyan} />
          <Text style={styles.invoiceTitle}>Digital invoice</Text>
        </View>
        <View style={styles.invoiceLineWide} />
        <View style={styles.invoiceLine} />
        <View style={styles.invoiceTotal}>
          <Text style={styles.invoiceTotalText}>Paid after service</Text>
          <Ionicons name="checkmark-circle" size={20} color={colors.green} />
        </View>
      </View>
      <Animated.View style={[styles.cashBadge, { opacity: shineOpacity, transform: [{ translateY: badgeBob }] }]}>
        <Ionicons name="wallet-outline" size={18} color={colors.amber} />
        <Text style={styles.cashBadgeText}>Cash confirmation</Text>
      </Animated.View>
      <View style={styles.paymentRail}>
        <View style={styles.paymentDot} />
        <View style={styles.paymentRailLine} />
        <View style={styles.paymentDotActive} />
      </View>
    </>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    page: { flex: 1, justifyContent: "space-between", padding: 24, backgroundColor: colors.background },
    topBadge: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 9, borderWidth: 1, borderColor: colors.heroBorder, borderRadius: 999, backgroundColor: colors.panel },
    topBadgeText: { color: colors.cyan, fontSize: 10, fontWeight: "900", letterSpacing: 1.3 },
    stage: { height: 310, justifyContent: "center", overflow: "hidden", borderWidth: 1, borderColor: colors.heroBorder, borderRadius: 22, backgroundColor: colors.panelRaised },
    backdropPanel: { position: "absolute", left: 18, right: 18, top: 24, bottom: 78, borderWidth: 1, borderColor: colors.border, borderRadius: 20, backgroundColor: colors.panel },
    salonSign: { position: "absolute", left: 34, top: 42, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 9, borderWidth: 1, borderColor: colors.heroBorder, borderRadius: 12, backgroundColor: colors.panelRaised },
    salonSignText: { color: colors.text, fontSize: 11, fontWeight: "900", letterSpacing: 1.4 },
    shineLine: { position: "absolute", right: 32, top: 46, width: 76, height: 3, borderRadius: 999, backgroundColor: colors.cyan },
    salonFloor: { position: "absolute", left: 28, right: 28, bottom: 48, height: 18, borderRadius: 999, backgroundColor: colors.activePanel },
    mirrorWrap: { position: "absolute", left: 46, top: 86, width: 96, height: 112, alignItems: "center" },
    mirror: { width: 82, height: 82, overflow: "hidden", borderWidth: 3, borderColor: colors.heroBorder, borderRadius: 41, backgroundColor: colors.panelRaised },
    mirrorShimmer: { width: 34, height: 96, backgroundColor: colors.activePanel, transform: [{ rotate: "22deg" }] },
    shelf: { width: 96, height: 10, marginTop: 12, borderRadius: 999, backgroundColor: colors.text },
    bottleTall: { position: "absolute", left: 22, bottom: 8, width: 10, height: 26, borderRadius: 5, backgroundColor: colors.cyan },
    bottleSmall: { position: "absolute", left: 40, bottom: 8, width: 12, height: 18, borderRadius: 6, backgroundColor: colors.amber },
    chairWrap: { position: "absolute", left: "50%", bottom: 58, width: 118, height: 142, marginLeft: -45 },
    chairBack: { position: "absolute", left: 18, top: 34, width: 72, height: 72, alignItems: "center", borderWidth: 2, borderColor: colors.background, borderRadius: 22, backgroundColor: colors.cyan },
    clientHead: { width: 34, height: 34, marginTop: -22, borderWidth: 2, borderColor: colors.background, borderRadius: 17, backgroundColor: colors.amber },
    clientCape: { width: 52, height: 46, marginTop: 6, borderTopLeftRadius: 22, borderTopRightRadius: 22, backgroundColor: colors.panelRaised },
    chairSeat: { position: "absolute", left: 8, bottom: 34, width: 94, height: 28, borderRadius: 18, backgroundColor: colors.text },
    chairStem: { position: "absolute", left: 51, bottom: 12, width: 9, height: 26, borderRadius: 999, backgroundColor: colors.text },
    chairBase: { position: "absolute", left: 24, bottom: 0, width: 64, height: 12, borderRadius: 999, backgroundColor: colors.text },
    barberPole: { position: "absolute", right: 48, bottom: 58, width: 34, height: 132, overflow: "hidden", borderWidth: 2, borderColor: colors.text, borderRadius: 17, backgroundColor: colors.panel },
    poleCap: { position: "absolute", top: 0, left: 0, right: 0, height: 12, backgroundColor: colors.text },
    poleCapBottom: { position: "absolute", bottom: 0, left: 0, right: 0, height: 12, backgroundColor: colors.text },
    poleStripeOne: { position: "absolute", left: -12, top: 30, width: 58, height: 14, borderRadius: 999, backgroundColor: colors.cyan },
    poleStripeTwo: { position: "absolute", left: -12, top: 72, width: 58, height: 14, borderRadius: 999, backgroundColor: colors.danger },
    scissorsTool: { position: "absolute", right: 108, top: 70, width: 80, height: 70 },
    scissorHandleOne: { position: "absolute", left: 6, bottom: 6, width: 24, height: 24, borderWidth: 4, borderColor: colors.amber, borderRadius: 12 },
    scissorHandleTwo: { position: "absolute", left: 28, bottom: 0, width: 24, height: 24, borderWidth: 4, borderColor: colors.amber, borderRadius: 12 },
    scissorBladeOne: { position: "absolute", left: 34, top: 8, width: 42, height: 7, borderRadius: 999, backgroundColor: colors.text, transform: [{ rotate: "-24deg" }] },
    scissorBladeTwo: { position: "absolute", left: 33, top: 25, width: 42, height: 7, borderRadius: 999, backgroundColor: colors.text, transform: [{ rotate: "20deg" }] },
    scissorPin: { position: "absolute", left: 34, bottom: 23, width: 10, height: 10, borderRadius: 5, backgroundColor: colors.cyan },
    sparkleOne: { position: "absolute", left: 146, top: 126 },
    sparkleTwo: { position: "absolute", right: 92, top: 44 },
    homeMapPanel: { position: "absolute", left: 26, right: 26, top: 34, bottom: 34, overflow: "hidden", borderWidth: 1, borderColor: colors.border, borderRadius: 22, backgroundColor: colors.panel },
    mapLineOne: { position: "absolute", left: 28, right: 28, top: 78, height: 2, borderRadius: 999, backgroundColor: colors.border, transform: [{ rotate: "-13deg" }] },
    mapLineTwo: { position: "absolute", left: 34, right: 34, bottom: 82, height: 2, borderRadius: 999, backgroundColor: colors.heroBorder, transform: [{ rotate: "16deg" }] },
    routeTrack: { position: "absolute", left: 72, right: 72, top: 148, height: 5, borderRadius: 999, backgroundColor: colors.activePanel },
    routePulse: { position: "absolute", left: 92, top: 140, width: 22, height: 22, borderWidth: 3, borderColor: colors.cyan, borderRadius: 11, backgroundColor: colors.panelRaised },
    homePin: { position: "absolute", left: 50, top: 84, width: 74, height: 74, alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: colors.background, borderRadius: 22, backgroundColor: colors.cyan },
    expertBadge: { position: "absolute", right: 34, top: 78, flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 12, paddingVertical: 9, borderWidth: 1, borderColor: colors.heroBorder, borderRadius: 999, backgroundColor: colors.panelRaised },
    expertText: { color: colors.text, fontSize: 11, fontWeight: "900" },
    homeCard: { position: "absolute", left: 42, right: 42, bottom: 54, flexDirection: "row", alignItems: "center", gap: 10, padding: 13, borderWidth: 1, borderColor: colors.heroBorder, borderRadius: 14, backgroundColor: colors.panelRaised },
    homeCardCopy: { flex: 1 },
    homeCardTitle: { color: colors.text, fontSize: 12, fontWeight: "900" },
    homeCardText: { color: colors.muted, fontSize: 10, fontWeight: "800", marginTop: 4 },
    slotCard: { position: "absolute", right: 44, bottom: 121, flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 999, backgroundColor: colors.activePanel },
    slotText: { color: colors.cyan, fontSize: 10, fontWeight: "900" },
    paymentShield: { position: "absolute", alignSelf: "center", top: 36, width: 92, height: 92, alignItems: "center", justifyContent: "center", borderWidth: 4, borderColor: colors.background, borderRadius: 46, backgroundColor: colors.green },
    invoiceCard: { position: "absolute", left: 44, right: 44, bottom: 58, padding: 16, borderWidth: 1, borderColor: colors.heroBorder, borderRadius: 18, backgroundColor: colors.panel },
    invoiceTop: { flexDirection: "row", alignItems: "center", gap: 10 },
    invoiceTitle: { color: colors.text, fontSize: 14, fontWeight: "900" },
    invoiceLineWide: { height: 8, width: "82%", marginTop: 18, borderRadius: 999, backgroundColor: colors.activePanel },
    invoiceLine: { height: 8, width: "58%", marginTop: 9, borderRadius: 999, backgroundColor: colors.border },
    invoiceTotal: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border },
    invoiceTotalText: { color: colors.green, fontSize: 11, fontWeight: "900" },
    cashBadge: { position: "absolute", right: 34, top: 124, flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 12, paddingVertical: 9, borderWidth: 1, borderColor: colors.border, borderRadius: 999, backgroundColor: colors.panelRaised },
    cashBadgeText: { color: colors.text, fontSize: 10, fontWeight: "900" },
    paymentRail: { position: "absolute", left: 58, top: 154, flexDirection: "row", alignItems: "center", gap: 8 },
    paymentDot: { width: 14, height: 14, borderRadius: 7, backgroundColor: colors.border },
    paymentRailLine: { width: 72, height: 4, borderRadius: 999, backgroundColor: colors.cyan },
    paymentDotActive: { width: 18, height: 18, borderWidth: 3, borderColor: colors.green, borderRadius: 9, backgroundColor: colors.panelRaised },
    offerBubble: { position: "absolute", flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 11, paddingVertical: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 999, backgroundColor: colors.panel },
    offerBubbleLeft: { left: 24, bottom: 72 },
    offerBubbleRight: { right: 22, top: 74 },
    offerText: { color: colors.text, fontSize: 11, fontWeight: "900" },
    copy: { marginTop: 28 },
    kicker: { color: colors.amber, fontSize: 10, fontWeight: "900", letterSpacing: 1.5 },
    title: { color: colors.text, fontSize: 38, fontWeight: "900", lineHeight: 44, marginTop: 12 },
    subtitle: { color: colors.muted, fontSize: 14, fontWeight: "700", lineHeight: 22, marginTop: 12 },
    footer: { gap: 16 },
    dots: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
    dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.border },
    dotActive: { width: 26, backgroundColor: colors.cyan },
    primary: { minHeight: 54, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingHorizontal: 18, borderRadius: 14, backgroundColor: colors.cyan },
    primaryText: { color: colors.buttonText, fontSize: 12, fontWeight: "900", letterSpacing: 1.2 },
  });
}
