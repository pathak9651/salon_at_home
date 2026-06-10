import { useEffect, useRef } from "react";
import { BackHandler } from "react-native";

export function useBackHandler(handler: () => boolean) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const onBackPress = () => {
      try {
        return handlerRef.current();
      } catch (e) {
        console.error("Error in back handler:", e);
        return false;
      }
    };

    let subscription: any;
    try {
      subscription = BackHandler.addEventListener("hardwareBackPress", onBackPress);
    } catch (e) {
      console.error("Failed to add back handler listener:", e);
    }

    return () => {
      try {
        if (subscription && typeof subscription.remove === "function") {
          subscription.remove();
        } else {
          // Fallback for older React Native versions or environments
          (BackHandler as any).removeEventListener("hardwareBackPress", onBackPress);
        }
      } catch (e) {
        console.warn("Failed to remove back handler listener:", e);
      }
    };
  }, []);
}
