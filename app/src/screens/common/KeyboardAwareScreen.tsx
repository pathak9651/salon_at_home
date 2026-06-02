import { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, ScrollViewProps, StyleProp, StyleSheet, ViewStyle } from "react-native";

type KeyboardAwareScreenProps = {
  children: ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  keyboardVerticalOffset?: number;
  showsVerticalScrollIndicator?: boolean;
} & Pick<ScrollViewProps, "refreshControl">;

export function KeyboardAwareScreen({
  children,
  contentContainerStyle,
  keyboardVerticalOffset = 0,
  showsVerticalScrollIndicator = false,
  refreshControl,
}: KeyboardAwareScreenProps) {
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={keyboardVerticalOffset}
      style={styles.flex}
    >
      <ScrollView
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={[contentContainerStyle, styles.keyboardSpace]}
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        keyboardShouldPersistTaps="handled"
        refreshControl={refreshControl}
        showsVerticalScrollIndicator={showsVerticalScrollIndicator}
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  keyboardSpace: { paddingBottom: 120 },
});
