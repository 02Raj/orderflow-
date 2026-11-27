import { api } from "./api";

export type Role = "owner" | "manager" | "staff" | "kitchen";

export interface SessionUser {
  id: string;
  restaurantId: string;
  email: string;
  fullName: string;
  role: Role;
}

const TOKEN_KEY = "orderflow.token";
const USER_KEY = "orderflow.user";
const LOCATION_KEY = "orderflow.location-session";
let documentBaseToken: string | null | undefined;
let documentLocation: LocationSession | null | undefined;

interface LocationSession {
  baseToken: string;
  token: string;
  user: SessionUser;
}

export function saveSession(token: string, user: SessionUser) {
  sessionStorage.removeItem(LOCATION_KEY);
  documentBaseToken = token;
  documentLocation = null;
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  sessionStorage.removeItem(LOCATION_KEY);
  documentBaseToken = null;
  documentLocation = null;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function getToken() {
  if (typeof window === "undefined") return null;
  const baseToken = currentBaseToken();
  return baseToken ? activeLocationSession(baseToken)?.token ?? baseToken : null;
}

export function getUser(): SessionUser | null {
  if (typeof window === "undefined") return null;
  const baseToken = currentBaseToken();
  if (!baseToken) return null;
  const selected = activeLocationSession(baseToken);
  if (selected) return selected.user;
  const raw = localStorage.getItem(USER_KEY);
  return raw ? (JSON.parse(raw) as SessionUser) : null;
}
function currentBaseToken() {
  const token = localStorage.getItem(TOKEN_KEY);
  if (documentBaseToken === undefined) documentBaseToken = token;
  return documentBaseToken === token ? token : null;
}

function activeLocationSession(baseToken: string) {
  // A switch takes effect after navigation. Old page controls keep their original token until unload.
  if (documentLocation === undefined) documentLocation = locationSession(baseToken);
  return documentLocation;
}

export function isDefaultLocationSession() {
  const baseToken = currentBaseToken();
  if (!baseToken) return false;
  const selected = activeLocationSession(baseToken);
  const raw = localStorage.getItem(USER_KEY);
  return !selected || (raw && (JSON.parse(raw) as SessionUser).restaurantId === selected.user.restaurantId);
}

function locationSession(baseToken: string): LocationSession | null {
  const raw = sessionStorage.getItem(LOCATION_KEY);
  if (!raw) return null;
  try {
    const session = JSON.parse(raw) as LocationSession;
    return session?.baseToken === baseToken ? session : null;
  } catch {
    return null;
  }
}

export async function openLocation(locationId: string, destination = "/app") {
  const baseToken = currentBaseToken();
  const token = getToken();
  if (!baseToken || !token) throw new Error("Sign in again to switch locations.");
  const next = await api<{ token: string; user: SessionUser }>("/auth/locations/switch", {
    method: "POST",
    token,
    json: { locationId },
  });
  if (baseToken !== currentBaseToken()) throw new Error("Your sign-in changed. Reload and try again.");
  sessionStorage.setItem(LOCATION_KEY, JSON.stringify({ baseToken, ...next }));
  const url = new URL(destination, window.location.origin);
  if (url.pathname === window.location.pathname && url.search === window.location.search) {
    window.history.replaceState(window.history.state, "", url);
    window.location.reload();
  } else {
    window.location.assign(url);
  }
}

export function reloadWhenSignInChanges() {
  function onStorage(event: StorageEvent) {
    if (event.storageArea === localStorage && (event.key === TOKEN_KEY || event.key === null)) {
      window.location.reload();
    }
  }
  window.addEventListener("storage", onStorage);
  return () => window.removeEventListener("storage", onStorage);
}
