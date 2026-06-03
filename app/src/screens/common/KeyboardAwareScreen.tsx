import { Children, ReactNode, RefObject, useEffect, useRef, useState } from "react";
import { Dimensions, Keyboard, KeyboardAvoidingView, KeyboardEvent, Platform, ScrollView, ScrollViewProps, StyleProp, StyleSheet, TextInput, ViewStyle } from "react-native";

type KeyboardAwareScreenProps = {
  children: ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  keyboardVerticalOffset?: number;
  scrollRef?: RefObject<ScrollView | null>;
  showsVerticalScrollIndicator?: boolean;
} & Pick<ScrollViewProps, "refreshControl">;

export function KeyboardAwareScreen({
  children,
  contentContainerStyle,
  keyboardVerticalOffset = 0,
  scrollRef: externalScrollRef,
  showsVerticalScrollIndicator = false,
  refreshControl,
}: KeyboardAwareScreenProps) {
  const internalScrollRef = useRef<ScrollView>(null);
  const scrollRef = externalScrollRef ?? internalScrollRef;
  const scrollY = useRef(0);
  const keyboardHeight = useRef(0);
  const [extraPadding, setExtraPadding] = useState(180);

  function scrollFocusedInputAboveKeyboard(event?: KeyboardEvent) {
    const focusedInput = TextInput.State.currentlyFocusedInput?.();
    if (!focusedInput || !scrollRef.current) return;

    const height = event?.endCoordinates.height ?? keyboardHeight.current;
    if (!height) return;
    keyboardHeight.current = height;
    setExtraPadding(Math.max(180, height + 96));

    window.setTimeout(() => {
      focusedInput.measureInWindow((_x, y, _width, inputHeight) => {
        const keyboardTop = Dimensions.get("window").height - height;
        const overlap = y + inputHeight + 28 - keyboardTop;
        if (overlap > 0) {
          scrollRef.current?.scrollTo({ y: scrollY.current + overlap, animated: true });
        }
      });
    }, 80);
  }

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const subscriptions = [
      Keyboard.addListener(showEvent, scrollFocusedInputAboveKeyboard),
      Keyboard.addListener("keyboardDidChangeFrame", scrollFocusedInputAboveKeyboard),
      Keyboard.addListener("keyboardDidHide", () => {
        keyboardHeight.current = 0;
        setExtraPadding(180);
      }),
    ];
    const focusTimer = window.setInterval(() => {
      if (keyboardHeight.current) scrollFocusedInputAboveKeyboard();
    }, 350);
    return () => {
      subscriptions.forEach((subscription) => subscription.remove());
      window.clearInterval(focusTimer);
    };
  }, []);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={keyboardVerticalOffset}
      style={styles.flex}
    >
      <ScrollView
        ref={scrollRef}
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={[contentContainerStyle, { paddingBottom: extraPadding }]}
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        keyboardShouldPersistTaps="handled"
        onScroll={(event) => {
          scrollY.current = event.nativeEvent.contentOffset.y;
        }}
        refreshControl={refreshControl}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={showsVerticalScrollIndicator}
      >
        {Children.toArray(children)}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
