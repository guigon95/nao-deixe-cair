import { HUB_KEYS } from '../storage/keys';
import type { Storage } from '../storage/storage';

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
    const raw = storage.getItem(HUB_KEYS.settings);
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
    storage.setItem(HUB_KEYS.settings, JSON.stringify(s));
  } catch {
    /* ignora */
  }
}
