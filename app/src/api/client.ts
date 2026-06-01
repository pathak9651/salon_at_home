import Constants from "expo-constants";
import { Platform } from "react-native";

function getApiUrl() {
  if (process.env.EXPO_PUBLIC_API_URL) return process.env.EXPO_PUBLIC_API_URL;

  const metroHost = Constants.expoConfig?.hostUri?.split(":")[0];
  if (metroHost) return `http://${metroHost}:4000/api`;

  if (Platform.OS === "android") return "http://10.0.2.2:4000/api";
  return "http://localhost:4000/api";
}

const API_URL = getApiUrl();

export class ApiError extends Error {
  status: number;
  action?: string;
  email?: string;

  constructor(message: string, status: number, body?: { action?: string; email?: string }) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.action = body?.action;
    this.email = body?.email;
  }
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
    const body = await response.json().catch(() => null) as { error?: string; action?: string; email?: string } | null;
    throw new ApiError(body?.error ?? "Something went wrong. Please try again.", response.status, body ?? undefined);
  }
  return response.json() as Promise<T>;
}
