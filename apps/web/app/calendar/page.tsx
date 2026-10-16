// Family calendar: merged family + personal overlay, create (all members),
// delete (Adults). Graceful banner when Google is not connected.
'use client';

import {useCallback, useEffect, useState, type CSSProperties} from 'react';
import {useRouter} from 'next/navigation';
import {VStack, HStack} from '@astryxdesign/core/Layout';
import {Center} from '@astryxdesign/core/Center';
import {Text, Heading} from '@astryxdesign/core/Text';
import {TextInput} from '@astryxdesign/core/TextInput';
import {Button} from '@astryxdesign/core/Button';
import {Section} from '@astryxdesign/core/Section';
import {List, ListItem} from '@astryxdesign/core/List';
import {authClient} from '@/lib/auth-client';
import {api, ApiError} from '@/lib/api';
import {useMe} from '@/lib/use-me';

const pageStyle: CSSProperties = {
  minHeight: '100%',
  backgroundColor: 'var(--color-background-body)',
};
const contentStyle: CSSProperties = {
  width: '100%',
  maxWidth: 640,
};

type CalEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  source: 'family' | 'personal';
};

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function CalendarPage() {
  const router = useRouter();
  const {data: session, isPending} = authClient.useSession();
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [banner, setBanner] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const {me} = useMe();
  const isAdult = me?.kind === 'adult';

  const load = useCallback(async () => {
    const from = new Date(Date.now() - 7 * 86400000).toISOString();
    const to = new Date(Date.now() + 30 * 86400000).toISOString();
    try {
      const data = await api.get<{events: CalEvent[]}>(
        `/api/calendar/events?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      );
      setEvents(data.events);
      setBanner(null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 503) {
        setBanner(
          'Family calendar is not connected yet. An Adult links Google in settings, and the family calendar is shared with each Adult.',
        );
        setEvents([]);
      } else {
        setNotice('Could not load events.');
      }
    }
  }, []);

  useEffect(() => {
    if (isPending) return;
    if (!session) {
      router.replace('/login');
      return;
    }
    load();
  }, [isPending, session, router, load]);

  const createEvent = async () => {
    if (!title.trim() || !start || !end) {
      setNotice('Enter a title, start, and end (YYYY-MM-DD HH:mm).');
      return;
    }
    const startIso = new Date(start.replace(' ', 'T'));
    const endIso = new Date(end.replace(' ', 'T'));
    if (Number.isNaN(startIso.getTime()) || Number.isNaN(endIso.getTime())) {
      setNotice('Use the format YYYY-MM-DD HH:mm.');
      return;
    }
    try {
      await api.post('/api/calendar/events', {
        title: title.trim(),
        start: startIso.toISOString(),
        end: endIso.toISOString(),
      });
      setTitle('');
      setStart('');
      setEnd('');
      setNotice(null);
      await load();
    } catch {
      setNotice('Could not create the event.');
    }
  };

  const deleteEvent = async (eventId: string) => {
    try {
      await api.del(`/api/calendar/events/${eventId}`);
      await load();
    } catch {
      setNotice('Could not delete the event (Adults only).');
    }
  };

  return (
    <Center axis="horizontal" padding={6} style={pageStyle}>
      <VStack gap={4} hAlign="stretch" style={contentStyle}>
        <Heading level={1}>Calendar</Heading>
        {banner && (
          <Text type="body" color="secondary">
            {banner}
          </Text>
        )}
        {notice && (
          <Text type="body" color="secondary">
            {notice}
          </Text>
        )}

        <Section>
          <VStack gap={3}>
            <Heading level={2}>Upcoming</Heading>
            {events.length === 0 ? (
              <Text type="body" color="secondary">
                Nothing scheduled in this window.
              </Text>
            ) : (
              <List hasDividers density="spacious">
                {events.map((ev) => (
                  <ListItem
                    key={ev.source + ev.id}
                    label={ev.title}
                    description={`${toLocalInput(ev.start).replace('T', ' ')} · ${ev.source}`}
                    endContent={
                      ev.source === 'family' && isAdult ? (
                        <Button
                          label="Delete"
                          variant="secondary"
                          size="lg"
                          onClick={() => deleteEvent(ev.id)}
                        />
                      ) : undefined
                    }
                  />
                ))}
              </List>
            )}
          </VStack>
        </Section>

        <Section>
          <VStack gap={3}>
            <Heading level={2}>New family event</Heading>
            <TextInput
              label="Title"
              placeholder="e.g. Dentist"
              size="lg"
              value={title}
              onChange={setTitle}
            />
            <HStack gap={2}>
              <TextInput
                label="Start (YYYY-MM-DD HH:mm)"
                placeholder="2026-10-20 18:00"
                size="lg"
                value={start}
                onChange={setStart}
              />
              <TextInput
                label="End (YYYY-MM-DD HH:mm)"
                placeholder="2026-10-20 19:00"
                size="lg"
                value={end}
                onChange={setEnd}
              />
            </HStack>
            <Button label="Create event" variant="primary" size="lg" onClick={createEvent} />
          </VStack>
        </Section>
      </VStack>
    </Center>
  );
}
