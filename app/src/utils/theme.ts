import { createContext, createElement, ReactNode, useContext } from "react";

export type ThemeMode = "dark" | "light";

export type ThemeColors = {
  background: string;
  panel: string;
  panelRaised: string;
  border: string;
  cyan: string;
  amber: string;
  green: string;
  text: string;
  muted: string;
  bar: string;
  danger: string;
  dangerPanel: string;
  buttonText: string;
  placeholder: string;
  activePanel: string;
  warningPanel: string;
  warningBorder: string;
  warningText: string;
  heroBorder: string;
};

export const palettes: Record<ThemeMode, ThemeColors> = {
  dark: {
    background: "#06101a",
    panel: "#091923",
    panelRaised: "#0b2330",
    border: "#173847",
    cyan: "#25dbf4",
    amber: "#ffb84d",
    green: "#42e8a4",
    text: "#edf8fb",
    muted: "#7c9aa6",
    bar: "#07151f",
    danger: "#ff8d86",
    dangerPanel: "#241719",
    buttonText: "#00202a",
    placeholder: "#54717d",
    activePanel: "#0c2c38",
    warningPanel: "#211b12",
    warningBorder: "#594320",
    warningText: "#b5a785",
    heroBorder: "#205063",
  },
  light: {
    background: "#f6f8fb",
    panel: "#ffffff",
    panelRaised: "#eef6f8",
    border: "#ccd8de",
    cyan: "#007c91",
    amber: "#9c6200",
    green: "#12805c",
    text: "#15242c",
    muted: "#657983",
    bar: "#ffffff",
    danger: "#b42318",
    dangerPanel: "#fff0ee",
    buttonText: "#ffffff",
    placeholder: "#82949d",
    activePanel: "#dff4f7",
    warningPanel: "#fff7e8",
    warningBorder: "#f0d59b",
    warningText: "#765018",
    heroBorder: "#a9d7df",
  },
};

type ThemeContextValue = {
  colors: ThemeColors;
  mode: ThemeMode;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue>({
  colors: palettes.dark,
  mode: "dark",
  toggleTheme: () => undefined,
});

export function ThemeProvider({ children, value }: { children: ReactNode; value: ThemeContextValue }) {
  return createElement(ThemeContext.Provider, { value }, children);
}

export function useTheme() {
  return useContext(ThemeContext);
}
