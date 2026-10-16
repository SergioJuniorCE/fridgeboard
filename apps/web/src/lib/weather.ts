'use client';

// Open-Meteo: free, no API key. Phone shares location once; coords cached.
export type Sky = 'sun' | 'cloud' | 'rain' | 'snow' | 'storm' | 'fog';

export type Weather = {
  temp: number;
  high: number;
  low: number;
  label: string;
  sky: Sky;
  place: string | null;
  hourly?: {time: string; temp: number; sky: Sky}[];
};

const GEO_KEY = 'yoggan:geo';

function describe(code: number): {label: string; sky: Sky} {
  if (code === 0) return {label: 'Clear sky', sky: 'sun'};
  if (code <= 3) return {label: code === 1 ? 'Mostly clear' : 'Cloudy', sky: 'cloud'};
  if (code <= 48) return {label: 'Foggy', sky: 'fog'};
  if (code <= 57) return {label: 'Drizzle', sky: 'rain'};
  if (code <= 67) return {label: 'Rain', sky: 'rain'};
  if (code <= 77) return {label: 'Snow', sky: 'snow'};
  if (code <= 82) return {label: 'Showers', sky: 'rain'};
  if (code <= 86) return {label: 'Snow showers', sky: 'snow'};
  return {label: 'Thunderstorm', sky: 'storm'};
}

function locate(): Promise<{lat: number; lon: number}> {
  try {
    const cached = localStorage.getItem(GEO_KEY);
    if (cached) {
      const [lat, lon] = cached.split(',').map(Number);
      if (Number.isFinite(lat) && Number.isFinite(lon)) return Promise.resolve({lat, lon});
    }
  } catch {
    // fall through to live lookup
  }
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('no geolocation'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        try {
          localStorage.setItem(GEO_KEY, `${lat},${lon}`);
        } catch {
          // ignore
        }
        resolve({lat, lon});
      },
      () => reject(new Error('location denied')),
      {timeout: 8000, maximumAge: 3600000},
    );
  });
}

export async function fetchWeather(): Promise<Weather> {
  const {lat, lon} = await locate();
  const wxUrl =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min` +
    `&hourly=temperature_2m,weather_code&timezone=auto&forecast_days=2`;
  const geoUrl =
    `https://api.bigdatacloud.net/data/reverse-geocode-client` +
    `?latitude=${lat}&longitude=${lon}&localityLanguage=en`;
  const [wxRes, geoRes] = await Promise.all([
    fetch(wxUrl),
    fetch(geoUrl).catch(() => null),
  ]);
  if (!wxRes.ok) throw new Error(`weather ${wxRes.status}`);
  const data = (await wxRes.json()) as {
    current?: {temperature_2m?: number; weather_code?: number};
    daily?: {temperature_2m_max?: number[]; temperature_2m_min?: number[]};
    hourly?: {time: string[]; temperature_2m: number[]; weather_code: number[]};
  };
  const temp = data.current?.temperature_2m;
  const code = data.current?.weather_code ?? 3;
  if (temp === undefined) throw new Error('no temperature');
  const {label, sky} = describe(code);
  let place: string | null = null;
  try {
    const geo = (await geoRes?.json()) as {city?: string; locality?: string} | undefined;
    place = geo?.city || geo?.locality || null;
  } catch {
    // place stays null
  }
  return {
    temp: Math.round(temp),
    high: Math.round(data.daily?.temperature_2m_max?.[0] ?? temp),
    low: Math.round(data.daily?.temperature_2m_min?.[0] ?? temp),
    label,
    sky,
    place,
    hourly: (data.hourly?.time ?? [])
      .map((time, index) => ({time, temp: Math.round(data.hourly!.temperature_2m[index]), sky: describe(data.hourly!.weather_code[index]).sky}))
      .filter(hour => new Date(hour.time).getTime() >= Date.now())
      .slice(0, 6),
  };
}

export function greeting(hour: number): string {
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 18) return 'Good afternoon';
  return 'Good evening';
}
