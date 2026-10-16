import {ArrowUpRightIcon, CalendarDaysIcon, ArrowRightIcon} from '@heroicons/react/24/outline';
import {VStack, HStack} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';
import {Button} from '@astryxdesign/core/Button';
import {Grid} from '@astryxdesign/core/Grid';
import {ClickableCard} from '@astryxdesign/core/ClickableCard';
import type {CalendarEvent} from './use-dashboard';
import {Eyebrow, eventDate, eventTime, sameDay, serif, panel} from './primitives';

type CalendarState = 'loading' | 'connected' | 'disconnected' | 'error';

export function NextUp({events, state, now, onRetry}: {events: CalendarEvent[] | null; state: CalendarState; now: Date; onRetry: () => void}) {
  const timed = events?.find(event => event.start.length > 10 && eventDate(event.end).getTime() > now.getTime());
  const next = timed ?? events?.find(event => eventDate(event.end).getTime() > now.getTime());
  const ongoing = next && eventDate(next.start) <= now;
  const minutes = next ? Math.max(0, Math.ceil((eventDate(ongoing ? next.end : next.start).getTime() - now.getTime()) / 60000)) : null;
  const count = minutes === null ? '—' : minutes >= 1440 ? Math.ceil(minutes / 1440) : minutes >= 120 ? Math.floor(minutes / 60) : minutes;
  const unit = minutes === null ? 'UP NEXT' : minutes >= 1440 ? 'DAYS' : minutes >= 120 ? 'HOURS' : 'MIN';
  const disconnected = state === 'disconnected';
  const title = next?.title ?? (disconnected ? 'Your day, together.' : state === 'error' ? 'Let’s try that again.' : state === 'loading' ? 'Getting your day ready…' : 'A little breathing room.');
  return <VStack gap={5} vAlign="between" style={{...panel, minHeight: 'var(--home-feature-height)', background: 'var(--home-yellow)', color: 'var(--home-ink)'}}>
    <HStack justify="between" vAlign="center">
      <Eyebrow style={{color: 'inherit'}}>{ongoing ? 'Happening now' : next ? `Next up · ${next.source === 'family' ? 'Everyone' : 'Your calendar'}` : 'Your household calendar'}</Eyebrow>
      <ArrowUpRightIcon width="var(--spacing-5)" height="var(--spacing-5)" aria-hidden="true" />
    </HStack>
    <HStack gap={4} justify="between" vAlign="center">
      <VStack gap={3} style={{minWidth: 0}}>
        <Text as="h2" style={{...serif, color: 'inherit', fontSize: 'var(--home-heading-size)', overflowWrap: 'anywhere'}}>{title}</Text>
        <Text style={{color: 'inherit', maxWidth: '40ch'}}>{next ? `${!sameDay(eventDate(next.start), now) ? eventDate(next.start).toLocaleDateString('en-US', {weekday: 'short', month: 'short', day: 'numeric'}) + ' · ' : ''}${eventTime(next.start)}${next.start.length !== 10 ? ` – ${eventTime(next.end)}` : ''}` : disconnected ? 'Connect Google Calendar and bring everyone’s plans into one place.' : state === 'error' ? 'Your calendar could not be reached.' : state === 'loading' ? 'Your upcoming plans will appear here.' : 'Nothing else scheduled. Enjoy the open time.'}</Text>
      </VStack>
      <VStack gap={0} hAlign="end" style={{flexShrink: 0}}>
        <Text hasTabularNumbers style={{fontFamily: 'var(--home-numbers)', fontSize: 'var(--home-clock-size)', fontStretch: '62%', lineHeight: 0.85, fontWeight: 800, color: 'inherit'}}>{count}</Text>
        <Eyebrow style={{color: 'inherit', marginTop: 'var(--spacing-3)'}}>{unit}{ongoing ? ' LEFT' : ''}</Eyebrow>
      </VStack>
    </HStack>
    <HStack>
      {state === 'error' ? <Button label="Try again" size="lg" onClick={onRetry} /> : <Button label={next ? 'View event' : 'Open calendar'} href="/calendar" size="lg" icon={<CalendarDaysIcon width="var(--spacing-4)" />} style={{background: 'var(--home-ink)', color: 'var(--home-white)'}} />}
    </HStack>
  </VStack>;
}

export function WeekAhead({events, state, now}: {events: CalendarEvent[] | null; state: CalendarState; now: Date}) {
  const days = Array.from({length: 7}, (_, index) => {const day = new Date(now); day.setDate(day.getDate() + index); return day;});
  const remaining = events?.filter(event => eventDate(event.end) > now).length;
  return <ClickableCard label="Open the calendar" href="/calendar" padding={6} style={{minHeight: 'var(--home-feature-height)', background: 'var(--home-ink)', color: 'var(--home-white)'}}>
    <VStack gap={5} vAlign="between" style={{height: '100%'}}>
      <HStack justify="between"><Eyebrow style={{color: 'inherit'}}>The week ahead</Eyebrow><ArrowUpRightIcon width="var(--spacing-5)" height="var(--spacing-5)" aria-hidden="true" /></HStack>
      <HStack gap={3} style={{alignItems: 'baseline'}}>
        <Text style={{...serif, color: 'inherit', fontSize: 'var(--font-size-4xl)'}}>{now.toLocaleDateString('en-US', {month: 'long'})}</Text>
        <Text type="supporting" style={{color: 'inherit', opacity: 0.7}}>{now.getFullYear()}</Text>
      </HStack>
      <Grid columns={7} gap={1}>
        {days.map((day, index) => <VStack key={day.toDateString()} gap={2} hAlign="center" style={{paddingBlock: 'var(--spacing-3)', borderRadius: 'var(--radius-element)', background: index === 0 ? 'var(--home-yellow)' : undefined, color: index === 0 ? 'var(--home-ink)' : 'inherit'}}>
          <Text type="supporting" style={{color: 'inherit', fontSize: 'var(--font-size-xs)', textTransform: 'uppercase'}}>{day.toLocaleDateString('en-US', {weekday: 'short'}).slice(0, 1)}</Text>
          <Text hasTabularNumbers weight="bold" style={{color: 'inherit', fontSize: 'var(--font-size-lg)'}}>{day.getDate()}</Text>
          <Text style={{color: 'inherit', fontSize: 'var(--font-size-xs)', lineHeight: 0.5}}>{events?.some(e => sameDay(eventDate(e.start), day)) ? '•' : '·'}</Text>
        </VStack>)}
      </Grid>
      <HStack justify="between" vAlign="center" style={{borderTop: 'var(--home-border-width) solid var(--color-border-emphasized)', paddingTop: 'var(--spacing-3)'}}>
        <Text type="supporting" style={{color: 'inherit', opacity: 0.8}}>{state === 'connected' ? `${remaining ?? 0} upcoming ${remaining === 1 ? 'event' : 'events'}` : state === 'loading' ? 'Loading plans…' : 'Make space for your plans'}</Text>
        <ArrowRightIcon width="var(--spacing-4)" height="var(--spacing-4)" aria-hidden="true" />
      </HStack>
    </VStack>
  </ClickableCard>;
}
