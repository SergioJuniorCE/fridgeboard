import {CloudIcon, SunIcon, BoltIcon} from '@heroicons/react/24/outline';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';
import {Grid} from '@astryxdesign/core/Grid';
import type {Weather, Sky} from '@/lib/weather';
import {Eyebrow, serif} from './primitives';

const icons: Record<Sky, typeof CloudIcon> = {sun: SunIcon, cloud: CloudIcon, rain: CloudIcon, snow: CloudIcon, storm: BoltIcon, fog: CloudIcon};

export function WeatherPanel({weather, state}: {weather: Weather | null; state: 'loading' | 'ready' | 'error'}) {
  const WeatherIcon = icons[weather?.sky ?? 'cloud'];
  return <VStack gap={3} vAlign="between" style={{minWidth: 0}}>
    <HStack gap={3} vAlign="center">
      <WeatherIcon width="var(--spacing-10)" height="var(--spacing-10)" strokeWidth={1.4} aria-hidden="true" />
      <Text style={{fontFamily: 'var(--home-numbers)', fontSize: 'var(--home-weather-size)', fontStretch: '62%', fontWeight: 800, lineHeight: 1}}>{weather ? `${weather.temp}°` : '—°'}</Text>
      <VStack gap={1}>
        <Eyebrow>{weather?.label ?? (state === 'loading' ? 'Checking weather' : 'Weather unavailable')}</Eyebrow>
        <Text type="supporting" color="secondary">{weather ? `H ${weather.high}° · L ${weather.low}°` : 'Local forecast'}</Text>
      </VStack>
    </HStack>
    <Text style={{...serif, fontSize: 'var(--font-size-xl)', fontStyle: 'italic', lineHeight: 1.3}}>{weather?.place ?? (state === 'loading' ? 'A look at the day ahead.' : 'Allow location access for your forecast.')}</Text>
    {weather?.hourly?.length ? <Grid columns={6} gap={2}>
      {weather.hourly.map(hour => {
        const HourIcon = icons[hour.sky];
        return <VStack key={hour.time} gap={1} hAlign="center">
          <Text type="supporting" color="secondary" style={{fontSize: 'var(--font-size-xs)'}}>{new Date(hour.time).toLocaleTimeString('en-US', {hour: 'numeric'}).replace(' ', '')}</Text>
          <HourIcon width="var(--spacing-5)" height="var(--spacing-5)" strokeWidth={1.4} aria-hidden="true" />
          <Text type="supporting" hasTabularNumbers>{hour.temp}°</Text>
        </VStack>;
      })}
    </Grid> : <Text type="supporting" color="secondary">{state === 'loading' ? 'Loading your local forecast…' : weather ? 'Your local weather, at a glance.' : 'Your dashboard works without location access.'}</Text>}
  </VStack>;
}
