import Link from 'next/link';
import {ArrowUpRightIcon, CalendarDaysIcon} from '@heroicons/react/24/outline';
import {VStack, HStack} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';
import {Grid} from '@astryxdesign/core/Grid';
import {Button} from '@astryxdesign/core/Button';
import type {DisplayMember} from '@/lib/api';
import type {CalendarEvent} from './use-dashboard';
import {Eyebrow, MemberDot, eventDate, eventTime, memberColor, memberTint, rule, sameDay, serif} from './primitives';

export function Schedule({members, events, activeMemberId, state, now}: {members: DisplayMember[]; events: CalendarEvent[] | null; activeMemberId: string | null; state: string; now: Date}) {
  const todayEvents = events?.filter(event => {
    const start = eventDate(event.start);
    const end = eventDate(event.end);
    return end > now && (sameDay(start, now) || start < now);
  }) ?? [];
  const groups = [{id: 'everyone', name: 'Everyone'}, ...members];
  return <VStack gap={5} style={{minWidth: 0}}>
    <HStack justify="between" style={{...rule, alignItems: 'baseline'}}>
      <Text as="h2" style={{...serif, fontSize: 'var(--font-size-3xl)'}}>The rest of today</Text>
      <Button label="Calendar" href="/calendar" variant="ghost" size="sm" endContent={<ArrowUpRightIcon width="var(--spacing-4)" />} />
    </HStack>
    <Grid columns={{minWidth: 150, max: 5, repeat: 'fit'}} gap={3}>
      {groups.map((member, index) => {
        const shared = member.id === 'everyone';
        const memberEvents = todayEvents.filter(event => shared ? event.source === 'family' : event.source === 'personal' && member.id === activeMemberId);
        const colorIndex = shared ? 2 : index - 1;
        return <VStack key={member.id} gap={3} style={{minWidth: 0, borderTop: `var(--spacing-1) solid ${memberColor(colorIndex)}`, paddingTop: 'var(--spacing-3)'}}>
          <HStack gap={2} vAlign="center"><MemberDot name={shared ? '•' : member.name} index={colorIndex} /><Eyebrow style={{overflowWrap: 'anywhere'}}>{member.name}</Eyebrow></HStack>
          {state === 'connected' ? memberEvents.length ? memberEvents.slice(0, 4).map(event => <Link key={event.source + event.id} href="/calendar" style={{display: 'block', textDecoration: 'none', color: 'var(--color-text-primary)', background: memberTint(colorIndex), borderRadius: 'var(--radius-element)', padding: 'var(--spacing-3)'}}>
            <VStack gap={1}><Text type="supporting" style={{fontFamily: 'var(--home-numbers)', color: memberColor(colorIndex), fontWeight: 600}}>{eventTime(event.start)}</Text><Text weight="medium" style={{overflowWrap: 'anywhere'}}>{event.title}</Text></VStack>
          </Link>) : <Text type="supporting" color="secondary" style={{paddingBlock: 'var(--spacing-3)'}}>{shared ? 'No shared plans today.' : 'No personal plans to show.'}</Text> : <Text type="supporting" color="secondary">{state === 'loading' ? 'Loading…' : 'Plans will appear here.'}</Text>}
          {memberEvents.length > 4 && <Link href="/calendar" style={{color: memberColor(colorIndex)}}><Text type="supporting">+{memberEvents.length - 4} more</Text></Link>}
        </VStack>;
      })}
    </Grid>
    {state !== 'connected' && state !== 'loading' && <HStack gap={3} vAlign="center" style={{padding: 'var(--spacing-4)', background: 'var(--color-background-muted)', borderRadius: 'var(--radius-element)'}}>
      <CalendarDaysIcon width="var(--spacing-6)" height="var(--spacing-6)" style={{flexShrink: 0}} aria-hidden="true" />
      <VStack gap={1}><Text weight="medium">{state === 'disconnected' ? 'One calendar. Everyone on the same page.' : 'Calendar temporarily unavailable.'}</Text><Text type="supporting" color="secondary">{state === 'disconnected' ? 'An Adult can connect Google Calendar in settings.' : 'Try refreshing the dashboard in a moment.'}</Text></VStack>
    </HStack>}
  </VStack>;
}
