import { STORAGE_KEYS } from '../game/config';
import type { Storage } from '../game/types';

export interface Settings {
  sound: boolean;
  reducedMotion: boolean;
}

export function systemPrefersReducedMotion(): boolean {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export function loadSettings(storage: Storage): Settings {
  const defaults: Settings = { sound: true, reducedMotion: systemPrefersReducedMotion() };
  try {
    const raw = storage.getItem(STORAGE_KEYS.settings);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      sound: typeof parsed.sound === 'boolean' ? parsed.sound : defaults.sound,
      reducedMotion: typeof parsed.reducedMotion === 'boolean' ? parsed.reducedMotion : defaults.reducedMotion,
    };
  } catch {
    return defaults;
  }
}

export function saveSettings(storage: Storage, s: Settings): void {
  try {
    storage.setItem(STORAGE_KEYS.settings, JSON.stringify(s));
  } catch {
    /* ignora */
  }
}
