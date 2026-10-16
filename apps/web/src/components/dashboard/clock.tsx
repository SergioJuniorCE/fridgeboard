'use client';

import {useEffect, useState} from 'react';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';

export function useClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const update = () => setNow(new Date());
    update();
    const timer = setInterval(update, 15000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

export function Clock({compact = false}: {compact?: boolean}) {
  const now = useClock();
  const time = now?.toLocaleTimeString('en-US', {hour: 'numeric', minute: '2-digit', hour12: true});
  const [digits, period] = time?.split(' ') ?? ['—:—', ''];
  if (compact) return <VStack gap={0} hAlign="center" aria-label={time}>
    <Text hasTabularNumbers style={{fontFamily: 'var(--home-numbers)', fontSize: 'var(--font-size-xl)', fontStretch: '62%', fontWeight: 800, lineHeight: 1}}>{digits}</Text>
    <Text type="supporting" style={{fontSize: 'var(--font-size-xs)'}}>{period}</Text>
  </VStack>;
  return <VStack gap={3}>
    <HStack gap={2} vAlign="start" aria-label={time ?? 'Loading time'}>
      <Text hasTabularNumbers style={{fontFamily: 'var(--home-numbers)', fontSize: 'var(--home-clock-size)', fontStretch: '62%', lineHeight: 0.85, fontWeight: 800, letterSpacing: '-0.035em'}}>{digits}</Text>
      <Text weight="bold" style={{fontFamily: 'var(--home-numbers)', fontSize: 'var(--font-size-xl)', paddingTop: 'var(--spacing-3)'}}>{period}</Text>
    </HStack>
    <HStack gap={3} style={{alignItems: 'baseline'}}>
      <Text type="label" weight="bold" style={{textTransform: 'uppercase', letterSpacing: '0.08em'}}>{now?.toLocaleDateString('en-US', {weekday: 'long'}) ?? 'Today'}</Text>
      <Text style={{fontFamily: 'var(--home-serif)', fontSize: 'var(--font-size-xl)'}}>{now?.toLocaleDateString('en-US', {month: 'long', day: 'numeric'})}</Text>
    </HStack>
  </VStack>;
}
