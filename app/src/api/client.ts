import Constants from "expo-constants";
import { Platform } from "react-native";

function getApiUrl() {
  if (process.env.EXPO_PUBLIC_API_URL) {
    if (!__DEV__ && !process.env.EXPO_PUBLIC_API_URL.startsWith("https://")) {
      throw new Error("Production API URL must use HTTPS.");
    }
    return process.env.EXPO_PUBLIC_API_URL;
  }

  if (!__DEV__) throw new Error("EXPO_PUBLIC_API_URL is required for production builds.");

  const metroHost = Constants.expoConfig?.hostUri?.split(":")[0];
  if (metroHost) return `http://${metroHost}:4000/api`;

  if (Platform.OS === "android") return "http://10.0.2.2:4000/api";
  return "http://localhost:4000/api";
}

export const API_URL = getApiUrl();
export const API_ORIGIN = API_URL.replace(/\/api\/?$/, "");

type ValidationDetails = {
  formErrors?: string[];
  fieldErrors?: Record<string, string[]>;
};

type ApiErrorBody = {
  error?: string;
  action?: string;
  email?: string;
  details?: ValidationDetails;
};

export function apiAssetUrl(path?: string | null) {
  if (!path) return undefined;
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_ORIGIN}${path.startsWith("/") ? path : `/${path}`}`;
}

export class ApiError extends Error {
  status: number;
  action?: string;
  email?: string;
  details?: ValidationDetails;

  constructor(message: string, status: number, body?: ApiErrorBody) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.action = body?.action;
    this.email = body?.email;
    this.details = body?.details;
  }
}

function getApiErrorMessage(body: ApiErrorBody | null) {
  const firstFieldError = Object.entries(body?.details?.fieldErrors ?? {}).find(([, messages]) => messages?.length);
  if (firstFieldError) return `${firstFieldError[0]}: ${firstFieldError[1][0]}`;
  return body?.details?.formErrors?.[0] ?? body?.error;
}

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  } catch {
    throw new Error(`Cannot reach the API at ${API_URL}. Check that the backend is running and the device is on the same network.`);
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null) as ApiErrorBody | null;
    throw new ApiError(getApiErrorMessage(body) ?? "Something went wrong. Please try again.", response.status, body ?? undefined);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
