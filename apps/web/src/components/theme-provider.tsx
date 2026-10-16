'use client';

import {useCallback, useEffect, useState, type ReactNode} from 'react';
import {Theme} from '@astryxdesign/core/theme';
import {householdTheme} from '@/themes/household/household';
import '@/themes/household/theme.css';

export type ColorSchemeSetting = 'auto' | 'light' | 'dark';

const STORAGE_KEY = 'yoggan:color-scheme';
export const THEME_CHANGED_EVENT = 'yoggan:theme-changed';

// Day is 07:00–19:00 local time; night otherwise.
export function schemeForHour(hour: number): 'light' | 'dark' {
  return hour >= 7 && hour < 19 ? 'light' : 'dark';
}

function readSetting(): ColorSchemeSetting {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'light' || v === 'dark' || v === 'auto') return v;
  } catch {
    // ignore (private mode)
  }
  return 'auto';
}

export const readSchemeSetting = readSetting;

export function writeSchemeSetting(v: ColorSchemeSetting) {
  try {
    localStorage.setItem(STORAGE_KEY, v);
  } catch {
    // ignore
  }
  window.dispatchEvent(new Event(THEME_CHANGED_EVENT));
}

function resolveMode(setting: ColorSchemeSetting): 'light' | 'dark' {
  if (setting !== 'auto') return setting;
  return schemeForHour(new Date().getHours());
}

export default function ThemeProvider({children}: {children: ReactNode}) {
  // Match server and client markup; apply this device's preference after mount.
  const [mode, setMode] = useState<'light' | 'dark'>('light');

  const refresh = useCallback(() => {
    setMode(resolveMode(readSetting()));
  }, []);

  useEffect(() => {
    refresh();
    // Re-check every minute so an open app follows the day/night boundary.
    const timer = setInterval(refresh, 60000);
    window.addEventListener(THEME_CHANGED_EVENT, refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener(THEME_CHANGED_EVENT, refresh);
    };
  }, [refresh]);

  return <Theme theme={householdTheme} mode={mode}>{children}</Theme>;
}
