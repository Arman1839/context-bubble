"use client";

export const AVATAR_STYLES = [
  { id: "adventurer", label: "Adventurer", imageStyle: "adventurer" },
  { id: "adventurer-neutral", label: "Adventurer Neutral", imageStyle: "adventurer-neutral" },
  { id: "avataaars", label: "Avataaars", imageStyle: "avataaars" },
  { id: "big-ears", label: "Big Ears", imageStyle: "big-ears" },
  { id: "big-smile", label: "Big Smile", imageStyle: "big-smile" },
  { id: "croodles", label: "Croodles", imageStyle: "croodles" },
  { id: "lorelei", label: "Lorelei", imageStyle: "lorelei" },
  { id: "lorelei-neutral", label: "Lorelei Neutral", imageStyle: "lorelei-neutral" },
  { id: "micah", label: "Micah", imageStyle: "micah" },
  { id: "notionists", label: "Notionist", imageStyle: "notionists" },
  { id: "open-peeps", label: "Open Peeps", imageStyle: "open-peeps" },
  { id: "personas", label: "Personas", imageStyle: "personas" },
  { id: "hr-representative", label: "HR Representative", imageStyle: "personas" },
  { id: "employee", label: "Employee", imageStyle: "avataaars" },
] as const;

export const AVATAR_ANIMALS = ["🐱", "🐶", "🦊", "🐼", "🐨", "🦁", "🐸", "🐧", "🐯", "🐰", "🦄", "🦉"] as const;

export interface AvatarProfile {
  kind: "human" | "animal";
  style: string;
  animal: string;
}

const DEFAULT_PROFILE: AvatarProfile = { kind: "human", style: "adventurer", animal: "🐱" };

export function getAvatarUrl(uid: string, name: string, style = DEFAULT_PROFILE.style): string {
  const selectedStyle = AVATAR_STYLES.find((item) => item.id === style) ?? AVATAR_STYLES[0];
  const seed = encodeURIComponent(`${uid}-${name}-${style}`);
  return `https://api.dicebear.com/9.x/${selectedStyle.imageStyle}/svg?seed=${seed}&backgroundColor=b6e3f4,c0aede,d1d4f9`;
}

export function getSavedAvatarProfile(uid?: string | null): AvatarProfile {
  if (typeof window === "undefined" || !uid) return DEFAULT_PROFILE;
  try {
    const saved = JSON.parse(localStorage.getItem(`context_bubble_avatar:${uid}`) || "null");
    if (!saved) return DEFAULT_PROFILE;
    return {
      // Profiles saved before avatar kinds existed used animals as add-ons.
      // Keep those users on their human avatar until they choose an animal avatar.
      kind: saved.kind === "animal" ? "animal" : "human",
      style: AVATAR_STYLES.some((item) => item.id === saved.style) ? saved.style : DEFAULT_PROFILE.style,
      animal: AVATAR_ANIMALS.includes(saved.animal) ? saved.animal : DEFAULT_PROFILE.animal,
    };
  } catch {
    return DEFAULT_PROFILE;
  }
}

export function saveAvatarProfile(uid: string | undefined, profile: AvatarProfile): void {
  if (typeof window === "undefined" || !uid) return;
  localStorage.setItem(`context_bubble_avatar:${uid}`, JSON.stringify(profile));
}
