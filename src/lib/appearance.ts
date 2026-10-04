export const appearanceOptions = [
  { id: "emerald", label: "Emerald" },
  { id: "daylight", label: "Daylight" },
  { id: "ocean", label: "Ocean" },
  { id: "rose", label: "Rose" },
  { id: "charcoal", label: "Charcoal" },
] as const;

export type Appearance = (typeof appearanceOptions)[number]["id"];
const storageKey = "ledger-appearance";

export function readAppearance(): Appearance {
  if (typeof window === "undefined") return "emerald";
  try {
    const saved = window.localStorage.getItem(storageKey);
    return appearanceOptions.find((option) => option.id === saved)?.id ?? "emerald";
  } catch {
    return "emerald";
  }
}

export function applyAppearance(appearance: Appearance) {
  document.documentElement.dataset.appearance = appearance;
  document.documentElement.classList.toggle("dark", appearance === "emerald" || appearance === "ocean" || appearance === "charcoal");
  try {
    window.localStorage.setItem(storageKey, appearance);
  } catch {
    // Appearance still applies for this session when browser storage is unavailable.
  }
}