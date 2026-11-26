export const KITCHEN_TARGETS_KEY = "ordernflow:kitchen_targets";

export interface KitchenTargets {
  targetMinutes: number;
  forgottenMinutes: number;
}

export const DEFAULT_KITCHEN_TARGETS: KitchenTargets = {
  targetMinutes: 6,
  forgottenMinutes: 12,
};

export function readKitchenTargets(): KitchenTargets {
  if (typeof window === "undefined") return DEFAULT_KITCHEN_TARGETS;
  try {
    const saved = JSON.parse(window.localStorage.getItem(KITCHEN_TARGETS_KEY) ?? "null") as Partial<KitchenTargets> | null;
    const targetMinutes = Number(saved?.targetMinutes);
    const forgottenMinutes = Number(saved?.forgottenMinutes);
    if (targetMinutes >= 2 && forgottenMinutes >= targetMinutes + 2) {
      return { targetMinutes, forgottenMinutes };
    }
  } catch {
    // A malformed old preference should never break the kitchen board.
  }
  return DEFAULT_KITCHEN_TARGETS;
}
