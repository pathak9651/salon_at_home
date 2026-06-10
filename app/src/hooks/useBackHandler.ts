import { useEffect, useRef } from "react";
import { BackHandler } from "react-native";

export function useBackHandler(handler: () => boolean) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const onBackPress = () => {
      return handlerRef.current();
    };

    const subscription = BackHandler.addEventListener("hardwareBackPress", onBackPress);
    return () => subscription.remove();
  }, []);
}
