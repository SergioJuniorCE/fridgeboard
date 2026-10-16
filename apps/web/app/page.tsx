'use client';

import {useEffect, useState, type CSSProperties} from 'react';
import {useRouter} from 'next/navigation';
import {Cog6ToothIcon, MagnifyingGlassIcon, PlusIcon} from '@heroicons/react/24/outline';
import {VStack, HStack} from '@astryxdesign/core/Layout';
import {Grid} from '@astryxdesign/core/Grid';
import {Text} from '@astryxdesign/core/Text';
import {TextInput} from '@astryxdesign/core/TextInput';
import {Button} from '@astryxdesign/core/Button';
import {IconButton} from '@astryxdesign/core/IconButton';
import {Icon} from '@astryxdesign/core/Icon';
import {List, ListItem} from '@astryxdesign/core/List';
import {authClient} from '@/lib/auth-client';
import {Clock, useClock} from '@/components/dashboard/clock';
import {useDashboard} from '@/components/dashboard/use-dashboard';
import {WeatherPanel} from '@/components/dashboard/weather-panel';
import {NextUp, WeekAhead} from '@/components/dashboard/day-panels';
import {Schedule} from '@/components/dashboard/schedule';
import {BudgetPanel, ShoppingSummary} from '@/components/dashboard/summary-panels';
import {Eyebrow, MemberDot, eventDate, rule, serif} from '@/components/dashboard/primitives';
import QuickAddSheet from '@/components/quick-add-sheet';

export default function Home() {
  const router = useRouter();
  const {data: session, isPending} = authClient.useSession();
  const data = useDashboard(!isPending && Boolean(session));
  const now = useClock();
  const [query, setQuery] = useState('');
  const [quickAdd, setQuickAdd] = useState(false);

  useEffect(() => {
    if (!isPending && !session) router.replace('/login');
    else if (data.members?.length === 0) router.replace('/welcome');
  }, [isPending, session, data.members, router]);

  if (data.error) return <VStack gap={4} padding={8} role="alert"><Text>{data.error}</Text><Button label="Try again" onClick={data.retry} /></VStack>;
  if (isPending || !data.members || !now) return <VStack gap={6} padding={8} aria-busy="true" aria-label="Loading dashboard" style={{minHeight: '100dvh', background: 'var(--color-background-body)'}}>
    <Eyebrow>Yoggan Home</Eyebrow><Text style={{...serif, fontSize: 'var(--font-size-4xl)'}}>Getting your day ready…</Text>
    <Grid columns={2} gap={5}>{[0, 1].map(i => <VStack key={i} style={{minHeight: 'var(--home-feature-height)', borderRadius: 'var(--radius-container)', background: 'var(--color-background-muted)'}} />)}</Grid>
  </VStack>;

  const members = data.members;
  const allItems = data.lists?.flatMap(list => list.items ?? []) ?? [];
  const needed = allItems.filter(item => item.status !== 'bought');
  const searching = query.trim().length > 0;
  const q = query.trim().toLocaleLowerCase();
  const foundItems = searching ? allItems.filter(item => item.title.toLocaleLowerCase().includes(q)).slice(0, 6) : [];
  const foundEvents = searching ? (data.events ?? []).filter(event => event.title.toLocaleLowerCase().includes(q)).slice(0, 4) : [];

  return <VStack gap={6} hAlign="stretch" style={{width: '100%', maxWidth: 'var(--home-max-width)', marginInline: 'auto', padding: 'var(--home-padding)', minWidth: 0}}>
    <HStack justify="between" vAlign="center" gap={3}>
      <VStack gap={1}>
        <Text as="h1" style={{fontSize: 'var(--font-size-sm)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.16em'}}>Yoggan Home</Text>
        <Text type="supporting" color="secondary">A good day starts together.</Text>
      </VStack>
      <HStack gap={2} vAlign="center">
        <Button label="Quick add" variant="ghost" size="sm" icon={<PlusIcon width="var(--spacing-4)" />} onClick={() => setQuickAdd(true)} />
        <IconButton label="Household settings" tooltip="Household settings" variant="ghost" icon={<Icon icon={Cog6ToothIcon} />} onClick={() => router.push('/settings')} />
      </HStack>
    </HStack>

    <Grid gap={6} style={{gridTemplateColumns: 'var(--home-header-columns)', ...rule, paddingBottom: 'var(--spacing-6)'}}>
      <Clock />
      <WeatherPanel weather={data.weather} state={data.weatherState} />
      <VStack gap={3} style={{display: 'var(--home-context-display)', minWidth: 0}}>
        <HStack justify="between" style={{marginBottom: 'var(--spacing-3)'}}><Eyebrow>Our household</Eyebrow><Text type="supporting" color="secondary">{members.length} {members.length === 1 ? 'member' : 'members'}</Text></HStack>
        <VStack gap={2}>
          {members.slice(0, 4).map((member, index) => <HStack key={member.id} gap={3} vAlign="center">
            <MemberDot name={member.name} index={index} />
            <Text weight="bold" maxLines={1} style={{flex: 1}}>{member.name}</Text>
            <Text type="supporting" color="secondary">{member.id === data.activeMemberId ? 'You' : member.kind === 'adult' ? 'Adult' : 'Minor'}</Text>
          </HStack>)}
          {members.length > 4 && <Button label={`+${members.length - 4} more members`} href="/settings" variant="ghost" size="sm" />}
        </VStack>
      </VStack>
    </Grid>

    <Grid gap={5} style={{gridTemplateColumns: 'var(--home-main-columns)'}}>
      <NextUp events={data.events} state={data.calendarState} now={now} onRetry={data.retry} />
      <WeekAhead events={data.events} state={data.calendarState} now={now} />
    </Grid>

    <Grid gap={6} style={{gridTemplateColumns: 'var(--home-main-columns)', alignItems: 'start'}}>
      <Schedule members={members} events={data.events} activeMemberId={data.activeMemberId} state={data.calendarState} now={now} />
      <Grid gap={3} style={{gridTemplateColumns: 'var(--home-summary-columns)'}}>
        <ShoppingSummary items={needed} listCount={data.lists?.length ?? 0} unavailable={!data.lists || data.lists.some(list => list.items === null)} />
        <BudgetPanel budget={data.budget} />
      </Grid>
    </Grid>

    <VStack gap={3} style={{borderTop: 'var(--home-border-width) solid var(--color-border)', paddingTop: 'var(--spacing-5)'}}>
      <HStack gap={3} vAlign="center" justify="between" style={{flexDirection: 'var(--home-topbar-direction)' as CSSProperties['flexDirection']}}>
        <Eyebrow style={{color: 'var(--color-text-secondary)'}}>Less juggling. More living.</Eyebrow>
        <HStack gap={2} vAlign="center" style={{width: 'var(--home-search-width)'}}>
          <MagnifyingGlassIcon width="var(--spacing-5)" height="var(--spacing-5)" style={{flexShrink: 0}} aria-hidden="true" />
          <TextInput label="Search events and shopping lists" isLabelHidden placeholder="Find an event or shopping item" value={query} onChange={setQuery} width="100%" />
        </HStack>
      </HStack>
      {searching && <VStack gap={2} aria-live="polite">
        {foundItems.length || foundEvents.length ? <List hasDividers>
          {foundItems.map(item => <ListItem key={item.id} label={item.title} description={item.listTitle} href={`/lists/${item.listId}`} />)}
          {foundEvents.map(event => <ListItem key={event.source + event.id} label={event.title} description={eventDate(event.start).toLocaleString('en-US', {weekday: 'short', hour: 'numeric', minute: '2-digit'})} href="/calendar" />)}
        </List> : <Text type="supporting" color="secondary">No results for “{query.trim()}”.</Text>}
      </VStack>}
    </VStack>
    <QuickAddSheet open={quickAdd} onClose={setQuickAdd} onNavigate={href => {setQuickAdd(false); router.push(href);}} />
  </VStack>;
}
