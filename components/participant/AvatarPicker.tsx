"use client";

import React, { useEffect, useState } from "react";
import { AVATAR_ANIMALS, AVATAR_STYLES, getAvatarUrl, getSavedAvatarProfile, saveAvatarProfile, type AvatarProfile } from "@/lib/avatar-profile";

interface Props {
  uid?: string;
  name: string;
  onChange?: (profile: AvatarProfile, avatarUrl: string) => void;
}

export function AvatarPicker({ uid, name, onChange }: Props) {
  const [profile, setProfile] = useState<AvatarProfile>({ kind: "human", style: "adventurer", animal: "🐱" });

  useEffect(() => {
    setProfile(getSavedAvatarProfile(uid));
  }, [uid]);

  const update = (next: AvatarProfile) => {
    setProfile(next);
    saveAvatarProfile(uid, next);
    onChange?.(next, getAvatarUrl(uid || name, name, next.style));
  };

  return (
    <section className="rounded-xl border border-white/10 bg-[#161d2e] p-3.5" aria-label="Choose your avatar">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-white">Choose one avatar</p>
          <p className="text-[11px] text-slate-400">Select a person or an animal.</p>
        </div>
      </div>
      <p className="mt-3 mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">People</p>
      <div className="flex flex-wrap gap-1">
        {AVATAR_STYLES.map((style) => (
          <button type="button" key={style.id} title={`${style.label} person avatar`} aria-label={`Choose ${style.label} person avatar`} onClick={() => update({ ...profile, kind: "human", style: style.id })} aria-pressed={profile.kind === "human" && profile.style === style.id} style={profile.kind === "human" && profile.style === style.id ? { borderWidth: 2, borderStyle: "solid", borderColor: "#b8860b", boxShadow: "0 0 0 2px #b8860b, 0 0 12px rgba(184, 134, 11, 0.6)" } : undefined} className={`grid h-9 w-9 place-items-center overflow-hidden rounded-full transition-all ${profile.kind === "human" && profile.style === style.id ? "bg-[#b8860b]" : "border-2 border-solid border-white/20 hover:border-white/50 hover:bg-white/5"}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={getAvatarUrl("avatar-picker", "Alex", style.id)} alt="" className="h-full w-full rounded-full bg-slate-800 object-cover" />
          </button>
        ))}
      </div>
      <p className="mt-3 mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Animals</p>
      <div className="mt-2 flex flex-wrap gap-1">
        {AVATAR_ANIMALS.map((animal) => (
          <button type="button" key={animal} onClick={() => update({ ...profile, kind: "animal", animal })} aria-label={`Choose ${animal} animal avatar`} aria-pressed={profile.kind === "animal" && profile.animal === animal} style={profile.kind === "animal" && profile.animal === animal ? { borderWidth: 2, borderStyle: "solid", borderColor: "#b8860b", boxShadow: "0 0 0 2px #b8860b, 0 0 12px rgba(184, 134, 11, 0.6)" } : undefined} className={`grid h-9 w-9 place-items-center rounded-full text-lg transition-all ${profile.kind === "animal" && profile.animal === animal ? "bg-[#b8860b]" : "border-2 border-solid border-white/20 hover:border-white/50 hover:bg-white/5"}`}>
            {animal}
          </button>
        ))}
      </div>
    </section>
  );
}
