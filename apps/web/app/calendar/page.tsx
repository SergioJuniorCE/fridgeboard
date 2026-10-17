// Family calendar: Dakboard-style day, 3-day, week and month views over the
// merged family + personal overlay. Every member creates, Adults delete.
// Graceful banner when Google is not connected.
'use client';

import {useCallback, useEffect, useMemo, useRef, useState, type CSSProperties} from 'react';
import {useRouter} from 'next/navigation';
import {ChevronLeftIcon, ChevronRightIcon, PlusIcon} from '@heroicons/react/24/outline';
import {VStack, HStack, StackItem} from '@astryxdesign/core/Layout';
import {Center} from '@astryxdesign/core/Center';
import {Text, Heading} from '@astryxdesign/core/Text';
import {TextInput} from '@astryxdesign/core/TextInput';
import {DateTimeInput, type ISODateTimeString} from '@astryxdesign/core/DateTimeInput';
import {Button} from '@astryxdesign/core/Button';
import {IconButton} from '@astryxdesign/core/IconButton';
import {Grid} from '@astryxdesign/core/Grid';
import {Card} from '@astryxdesign/core/Card';
import {SegmentedControl, SegmentedControlItem} from '@astryxdesign/core/SegmentedControl';
import {ContextMenu} from '@astryxdesign/core/ContextMenu';
import {authClient} from '@/lib/auth-client';
import {api, ApiError} from '@/lib/api';
import {useMe} from '@/lib/use-me';
import {useClock} from '@/components/dashboard/clock';
import {Eyebrow, serif, eventDate, sameDay} from '@/components/dashboard/primitives';

const pageStyle: CSSProperties = {
  minHeight: '100%',
  backgroundColor: 'var(--color-background-body)',
};
const contentStyle: CSSProperties = {
  width: '100%',
  maxWidth: 1100,
};
// The timeline owns its own scroll: everything above it (header, all-day strip,
// tab bar) is fixed chrome, so dvh math is the only way to express "viewport
// minus chrome" — the same trick the lists board uses.
const scrollStyle: CSSProperties = {
  height: 'calc(100dvh - 300px)',
  minHeight: 320,
  overflow: 'auto',
  position: 'relative',
  borderTop: 'var(--home-border-width) solid var(--color-border)',
};
const gutterStyle: CSSProperties = {
  width: 'var(--spacing-12)',
  flexShrink: 0,
  position: 'sticky',
  left: 0,
  zIndex: 2,
  background: 'var(--color-background-body)',
  borderRight: 'var(--home-border-width) solid var(--color-border)',
};
// Hour lines are a repeating gradient rather than 24 nodes per column: the
// stop distance is the --home-hour-height token, so the grid and the gutter
// labels can never drift apart.
const hourLines: CSSProperties = {
  backgroundImage:
    'repeating-linear-gradient(to bottom, var(--color-border) 0, var(--color-border) var(--home-border-width), transparent var(--home-border-width), transparent var(--home-hour-height))',
};
const columnStyle: CSSProperties = {
  flex: '1 1 var(--home-day-column-min)',
  minWidth: 'var(--home-day-column-min)',
  position: 'relative',
  height: 'calc(var(--home-hour-height) * 24)',
  borderRight: 'var(--home-border-width) solid var(--color-border)',
  ...hourLines,
};

type View = 'day' | '3day' | 'week' | 'month';

type CalEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  source: 'family' | 'personal';
};

const EVENT_COLORS = [
  'var(--home-event-dark)',
  'var(--home-blue)',
  'var(--home-teal)',
  'var(--home-gold)',
  'var(--home-pink)',
];

// Stable per event, so a colour never flips between renders.
function colorFor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return EVENT_COLORS[hash % EVENT_COLORS.length];
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
// Monday-first weeks.
function startOfWeek(d: Date): Date {
  const x = startOfDay(d);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}
function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function at(minutes: number): string {
  return `calc(var(--home-hour-height) * ${(minutes / 60).toFixed(4)})`;
}
function clock(d: Date): string {
  return d.toLocaleTimeString('en-US', {hour: 'numeric', minute: '2-digit'});
}
function localInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function windowFor(days: Date[]): {from: Date; to: Date} {
  return {from: addDays(days[0], -1), to: addDays(days[days.length - 1], 2)};
}

type Span = {start: Date; end: Date};

// Google all-day events arrive as bare dates with an exclusive end date.
function spanOf(ev: CalEvent): Span {
  const start = eventDate(ev.start);
  let end = eventDate(ev.end);
  if (end.getTime() <= start.getTime()) end = addDays(start, 1);
  return {start, end};
}
function isAllDay(ev: CalEvent): boolean {
  const {start, end} = spanOf(ev);
  return ev.start.length === 10 || end.getTime() - start.getTime() >= 86400000;
}
function overlapsDay(span: Span, day: Date): boolean {
  const dayStart = day.getTime();
  return span.start.getTime() < dayStart + 86400000 && span.end.getTime() > dayStart;
}

type Placement = {ev: CalEvent; start: number; end: number};

// Overlapping events share the column: cluster them, then hand each cluster
// one lane per maximum overlap so nothing is drawn under anything else.
function assignLanes(items: Placement[]): {item: Placement; lane: number; lanes: number}[] {
  const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end);
  const out: {item: Placement; lane: number; lanes: number}[] = [];
  let cluster: typeof out = [];
  let clusterEnd = -1;
  const flush = () => {
    if (cluster.length === 0) return;
    const count = Math.max(...cluster.map((c) => c.lane)) + 1;
    for (const c of cluster) c.lanes = count;
    out.push(...cluster);
    cluster = [];
    clusterEnd = -1;
  };
  for (const item of sorted) {
    if (cluster.length > 0 && item.start >= clusterEnd) flush();
    const taken = new Set(cluster.filter((c) => c.item.end > item.start).map((c) => c.lane));
    let lane = 0;
    while (taken.has(lane)) lane += 1;
    cluster.push({item, lane, lanes: 1});
    clusterEnd = Math.max(clusterEnd, item.end);
  }
  flush();
  return out;
}

export default function CalendarPage() {
  const router = useRouter();
  const {data: session, isPending} = authClient.useSession();
  const {me} = useMe();
  const isAdult = me?.kind === 'adult';
  const now = useClock();

  const [events, setEvents] = useState<CalEvent[]>([]);
  const [banner, setBanner] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [view, setView] = useState<View>('day');
  const [anchor, setAnchor] = useState<Date>(() => startOfDay(new Date()));
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [start, setStart] = useState<ISODateTimeString | ''>('');
  const [end, setEnd] = useState<ISODateTimeString | ''>('');
  const [saving, setSaving] = useState(false);
  const scrollRef = useRef<HTMLElement>(null);
  const loadedRef = useRef<{from: number; to: number} | null>(null);

  const nowDate = now ?? new Date();
  const today = startOfDay(nowDate);

  const days = useMemo(() => {
    if (view === 'day') return [anchor];
    if (view === '3day') return [0, 1, 2].map((n) => addDays(anchor, n));
    if (view === 'week') {
      const monday = startOfWeek(anchor);
      return [0, 1, 2, 3, 4, 5, 6].map((n) => addDays(monday, n));
    }
    const gridStart = startOfWeek(startOfMonth(anchor));
    return Array.from({length: 42}, (_, i) => addDays(gridStart, i));
  }, [view, anchor]);

  const load = useCallback(async (from: Date, to: Date) => {
    const f = from.getTime();
    const t = to.getTime();
    const current = loadedRef.current;
    if (current && current.from <= f && current.to >= t) return;
    try {
      const data = await api.get<{events: CalEvent[]}>(
        `/api/calendar/events?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`,
      );
      loadedRef.current = {from: f, to: t};
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

  const refresh = useCallback(async () => {
    loadedRef.current = null;
    const {from, to} = windowFor(days);
    await load(from, to);
  }, [days, load]);

  useEffect(() => {
    if (isPending) return;
    if (!session) {
      router.replace('/login');
      return;
    }
    const {from, to} = windowFor(days);
    void load(from, to);
  }, [isPending, session, router, days, load]);

  // Open on the red line when today is on screen, and keep today's column in
  // view in the multi-day views (a week is wider than a phone).
  useEffect(() => {
    if (view === 'month') return;
    const scroller = scrollRef.current;
    if (!scroller) return;
    const line = scroller.querySelector<HTMLElement>('[data-now-line]');
    if (line) scroller.scrollTop = Math.max(0, line.offsetTop - 96);
    const gutterWidth = scroller.querySelector<HTMLElement>('[data-gutter]')?.offsetWidth ?? 0;
    const todayColumn = scroller.querySelector<HTMLElement>('[data-today-col]');
    scroller.scrollLeft = todayColumn
      ? Math.max(0, todayColumn.offsetLeft - gutterWidth)
      : 0;
  }, [view, anchor]);

  const step = (dir: 1 | -1) => {
    if (view === 'day') setAnchor(addDays(anchor, dir));
    else if (view === '3day') setAnchor(addDays(anchor, dir * 3));
    else if (view === 'week') setAnchor(addDays(anchor, dir * 7));
    else setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() + dir, 1));
  };

  const openForm = () => {
    const base = days.find((d) => d.getTime() >= today.getTime()) ?? days[0];
    let startAt = new Date(base.getFullYear(), base.getMonth(), base.getDate(), 10, 0);
    if (sameDay(base, today)) {
      startAt = new Date(nowDate);
      startAt.setMinutes(startAt.getMinutes() < 30 ? 30 : 60, 0, 0);
    }
    setTitle('');
    setStart(localInput(startAt) as ISODateTimeString);
    setEnd(localInput(new Date(startAt.getTime() + 3600000)) as ISODateTimeString);
    setShowForm(true);
  };

  const createEvent = async () => {
    if (!title.trim() || !start || !end) {
      setNotice('Give the event a title, a start, and an end.');
      return;
    }
    const startAt = new Date(start);
    const endAt = new Date(end);
    if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime()) || endAt <= startAt) {
      setNotice('The end has to be after the start.');
      return;
    }
    setSaving(true);
    try {
      await api.post('/api/calendar/events', {
        title: title.trim(),
        start: startAt.toISOString(),
        end: endAt.toISOString(),
      });
      setShowForm(false);
      setNotice(null);
      await refresh();
    } catch {
      setNotice('Could not create the event.');
    } finally {
      setSaving(false);
    }
  };

  const deleteEvent = async (eventId: string) => {
    try {
      await api.del(`/api/calendar/events/${eventId}`);
      await refresh();
    } catch {
      setNotice('Could not delete the event (Adults only).');
    }
  };

  const rangeStart = days[0].getTime();
  const rangeEnd = days[days.length - 1].getTime() + 86400000;
  const visible = events.filter((ev) => {
    const span = spanOf(ev);
    return span.start.getTime() < rangeEnd && span.end.getTime() > rangeStart;
  });
  const allDay = visible.filter(isAllDay);
  const timed = visible.filter((ev) => !isAllDay(ev));

  const first = days[0];
  const last = days[days.length - 1];
  const includesToday = today.getTime() >= rangeStart && today.getTime() < rangeEnd;
  const todaySuffix = includesToday ? ' · today' : '';
  const titleLine =
    view === 'day'
      ? `${nowDate.toLocaleDateString('en-US', {weekday: 'long'})} ${anchor.getDate()}`
      : view === 'month'
        ? anchor.toLocaleDateString('en-US', {month: 'long'})
        : `${first.getDate()} – ${last.getDate()}`;
  const subLine =
    view === 'month'
      ? `${anchor.getFullYear()}${todaySuffix}`
      : first.getMonth() === last.getMonth()
        ? `${first.toLocaleDateString('en-US', {month: 'long'})} ${first.getFullYear()}${todaySuffix}`
        : `${first.toLocaleDateString('en-US', {month: 'short'})} – ${last.toLocaleDateString('en-US', {month: 'short'})} ${last.getFullYear()}${todaySuffix}`;

  const hours = Array.from({length: 24}, (_, i) => i);

  const chipVisual = (ev: CalEvent): CSSProperties => ({
    boxSizing: 'border-box',
    background: colorFor(ev.id),
    color: 'var(--home-event-text)',
    borderRadius: 'var(--radius-element)',
    padding: 'var(--spacing-0-5)',
    overflow: 'hidden',
  });

  // ContextMenu destructures `style` without forwarding it to its trigger, so a
  // positioned ContextMenu cannot be positioned from the outside: the chip
  // carries the geometry instead, and the (zero-height, in-flow) trigger sits
  // at the column origin and inherits the right-click/long-press from bubbling.
  const renderChip = (
    ev: CalEvent,
    label?: string,
    showTime = false,
    box?: CSSProperties,
  ) => (
    <VStack gap={0} style={{...chipVisual(ev), ...(box ?? {height: '100%'})}}>
      <Text type="label" maxLines={1} style={{color: 'inherit'}}>
        {ev.title}
      </Text>
      {showTime && label ? (
        <Text type="supporting" maxLines={1} style={{color: 'inherit', opacity: 0.85}}>
          {label}
        </Text>
      ) : null}
    </VStack>
  );

  const renderDayColumn = (day: Date) => {
    const dayStart = day.getTime();
    const placements: Placement[] = [];
    for (const ev of timed) {
      const span = spanOf(ev);
      if (!overlapsDay(span, day)) continue;
      const startMs = Math.max(span.start.getTime(), dayStart);
      const endMs = Math.min(span.end.getTime(), dayStart + 86400000);
      if (endMs <= startMs) continue;
      placements.push({
        ev,
        start: (startMs - dayStart) / 60000,
        end: (endMs - dayStart) / 60000,
      });
    }
    const laidOut = assignLanes(placements);
    const isToday = sameDay(day, today);
    const nowMinutes = nowDate.getHours() * 60 + nowDate.getMinutes();

    return (
      <StackItem
        key={day.toISOString()}
        style={columnStyle}
        data-today-col={isToday ? 'true' : undefined}>
        {laidOut.map(({item, lane, lanes}) => {
          const duration = item.end - item.start;
          const label = `${clock(new Date(dayStart + item.start * 60000))} – ${clock(
            new Date(dayStart + item.end * 60000),
          )}`;
          const style: CSSProperties = {
            position: 'absolute',
            top: at(item.start),
            left: `calc(${(100 / lanes).toFixed(4)}% * ${lane} + var(--spacing-0-5))`,
            width: `calc(${(100 / lanes).toFixed(4)}% - var(--spacing-1))`,
            height: `calc(var(--home-hour-height) * ${(duration / 60).toFixed(4)} - var(--spacing-0-5))`,
            minHeight: 'var(--spacing-6)',
            zIndex: 2,
          };
          const canDelete = item.ev.source === 'family' && isAdult;
          if (!canDelete) {
            return (
              <StackItem key={item.ev.id} style={style}>
                {renderChip(item.ev, label, duration >= 60)}
              </StackItem>
            );
          }
          return (
            <ContextMenu
              key={item.ev.id}
              label={`Actions for ${item.ev.title}`}
              items={[{label: 'Delete event', onClick: () => deleteEvent(item.ev.id)}]}>
              {renderChip(item.ev, label, duration >= 60, style)}
            </ContextMenu>
          );
        })}
        {isToday ? (
          <StackItem
            data-now-line="true"
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: at(nowMinutes),
              borderTop: '2px solid var(--color-error)',
              zIndex: 3,
            }}>
            <Text
              type="label"
              style={{
                position: 'absolute',
                top: 'calc(var(--spacing-1) * -1)',
                left: 0,
                background: 'var(--color-error)',
                color: 'var(--color-on-error)',
                borderRadius: 'var(--radius-element)',
                padding: 'var(--spacing-0-5)',
                fontSize: 'var(--font-size-xs)',
              }}>
              {clock(nowDate)}
            </Text>
          </StackItem>
        ) : null}
      </StackItem>
    );
  };

  const jumpTo = (day: Date) => {
    setAnchor(startOfDay(day));
    setView('day');
  };

  const monthHas = (day: Date) => day.getTime() >= rangeStart && day.getTime() < rangeEnd;
  const eventsOn = (day: Date) =>
    events.filter((ev) => overlapsDay(spanOf(ev), day) && !isAllDay(ev)).concat(
      events.filter((ev) => isAllDay(ev) && overlapsDay(spanOf(ev), day)),
    );

  return (
    <Center axis="horizontal" padding={6} style={pageStyle}>
      <VStack gap={3} hAlign="stretch" style={contentStyle}>
        <HStack justify="between" vAlign="center" gap={2} wrap="wrap">
          <HStack gap={1} vAlign="center">
            <IconButton
              label="Previous"
              icon={<ChevronLeftIcon width="var(--spacing-5)" height="var(--spacing-5)" />}
              variant="ghost"
              size="lg"
              onClick={() => step(-1)}
            />
            <VStack gap={0} hAlign="start">
              <Text as="h1" style={{...serif, fontSize: 'var(--font-size-3xl)'}}>
                {titleLine}
              </Text>
              <Eyebrow>{subLine}</Eyebrow>
            </VStack>
            <IconButton
              label="Next"
              icon={<ChevronRightIcon width="var(--spacing-5)" height="var(--spacing-5)" />}
              variant="ghost"
              size="lg"
              onClick={() => step(1)}
            />
            {!includesToday ? (
              <Button
                label="Today"
                variant="secondary"
                size="lg"
                onClick={() => setAnchor(today)}
              />
            ) : null}
          </HStack>
          <HStack gap={2} vAlign="center">
            <SegmentedControl
              label="Calendar view"
              value={view}
              onChange={(value) => {
                const next = value as View;
                setView(next);
                if (next === 'day') setAnchor(today);
              }}>
              <SegmentedControlItem value="day" label="Today" />
              <SegmentedControlItem value="3day" label="3 Day" />
              <SegmentedControlItem value="week" label="Week" />
              <SegmentedControlItem value="month" label="Month" />
            </SegmentedControl>
            <IconButton
              label={showForm ? 'Close new event' : 'Add event'}
              icon={<PlusIcon width="var(--spacing-5)" height="var(--spacing-5)" />}
              variant="primary"
              size="lg"
              onClick={() => (showForm ? setShowForm(false) : openForm())}
            />
          </HStack>
        </HStack>

        {banner ? (
          <Text type="body" color="secondary">
            {banner}
          </Text>
        ) : null}
        {notice ? (
          <Text type="body" color="secondary">
            {notice}
          </Text>
        ) : null}

        {showForm ? (
          <Card padding={4}>
            <VStack gap={3} hAlign="stretch">
              <Heading level={2}>New family event</Heading>
              <TextInput
                label="Title"
                placeholder="e.g. Dentist"
                size="lg"
                value={title}
                onChange={setTitle}
              />
              <HStack gap={2} vAlign="start" wrap="wrap">
                <DateTimeInput
                  label="Starts"
                  size="lg"
                  hourFormat="12h"
                  value={start === '' ? undefined : start}
                  onChange={(value) => setStart(value ?? '')}
                />
                <DateTimeInput
                  label="Ends"
                  size="lg"
                  hourFormat="12h"
                  value={end === '' ? undefined : end}
                  onChange={(value) => setEnd(value ?? '')}
                />
              </HStack>
              <HStack gap={2}>
                <Button
                  label="Create event"
                  variant="primary"
                  size="lg"
                  isLoading={saving}
                  onClick={createEvent}
                />
                <Button label="Cancel" variant="ghost" size="lg" onClick={() => setShowForm(false)} />
              </HStack>
            </VStack>
          </Card>
        ) : null}

        {view === 'month' ? (
          <Grid columns={7} gap={0.5} width="100%">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((dow) => (
              <Eyebrow key={dow}>{dow}</Eyebrow>
            ))}
            {days.map((day) => {
              const inMonth = day.getMonth() === anchor.getMonth();
              const isToday = sameDay(day, today);
              const dayEvents = monthHas(day) ? eventsOn(day) : [];
              return (
                <VStack
                  key={day.toISOString()}
                  gap={0.5}
                  hAlign="start"
                  style={{
                    minHeight: 'var(--home-week-day-height)',
                    background: inMonth
                      ? 'var(--color-background-card)'
                      : 'var(--color-background-muted)',
                    borderRadius: 'var(--radius-element)',
                    padding: 'var(--spacing-1)',
                    overflow: 'hidden',
                    opacity: inMonth ? 1 : 0.6,
                  }}>
                  <Button
                    label={String(day.getDate())}
                    variant={isToday ? 'primary' : 'ghost'}
                    size="sm"
                    style={{paddingInline: 'var(--spacing-1)'}}
                    onClick={() => jumpTo(day)}
                  />
                  {dayEvents.slice(0, 3).map((ev) => (
                    <StackItem
                      key={ev.id}
                      role="img"
                      aria-label={ev.title}
                      style={{
                        width: '100%',
                        height: 'var(--spacing-1)',
                        background: colorFor(ev.id),
                        borderRadius: 'var(--radius-full)',
                      }}
                    />
                  ))}
                  {dayEvents.length > 3 ? (
                    <Text type="supporting" color="secondary">
                      +{dayEvents.length - 3} more
                    </Text>
                  ) : null}
                </VStack>
              );
            })}
          </Grid>
        ) : (
          <VStack gap={2} hAlign="stretch">
            {allDay.length > 0 ? (
              <HStack gap={2} vAlign="start" wrap="wrap">
                <Text
                  type="label"
                  style={{
                    width: 'var(--spacing-12)',
                    flexShrink: 0,
                    whiteSpace: 'nowrap',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    fontSize: 'var(--font-size-xs)',
                  }}>
                  All day
                </Text>
                <HStack gap={1} wrap="wrap">
                  {allDay.map((ev) => {
                    const chip = (
                      <VStack
                        gap={0}
                        style={{
                          background: colorFor(ev.id),
                          color: 'var(--home-event-text)',
                          borderRadius: 'var(--radius-element)',
                          padding: 'var(--spacing-1) var(--spacing-2)',
                        }}>
                        <Text type="label" maxLines={1} style={{color: 'inherit'}}>
                          {ev.title}
                        </Text>
                      </VStack>
                    );
                    if (!(ev.source === 'family' && isAdult)) return <StackItem key={ev.id}>{chip}</StackItem>;
                    return (
                      <ContextMenu
                        key={ev.id}
                        label={`Actions for ${ev.title}`}
                        items={[{label: 'Delete event', onClick: () => deleteEvent(ev.id)}]}>
                        {chip}
                      </ContextMenu>
                    );
                  })}
                </HStack>
              </HStack>
            ) : null}

            <StackItem size="fill" isScrollable ref={scrollRef} style={scrollStyle}>
              <HStack gap={0} vAlign="start" style={{width: '100%'}}>
                <VStack gap={0} style={gutterStyle} data-gutter="true">
                  {hours.map((h) => (
                    <Text
                      key={h}
                      as="div"
                      type="supporting"
                      color="secondary"
                      style={{
                        height: 'var(--home-hour-height)',
                        boxSizing: 'border-box',
                        textAlign: 'right',
                        paddingTop: 'var(--spacing-0-5)',
                        paddingRight: 'var(--spacing-2)',
                        fontSize: 'var(--font-size-xs)',
                        whiteSpace: 'nowrap',
                      }}>
                      {new Date(2000, 0, 1, h).toLocaleTimeString('en-US', {
                        hour: 'numeric',
                      })}
                    </Text>
                  ))}
                </VStack>
                {days.map(renderDayColumn)}
              </HStack>
            </StackItem>
          </VStack>
        )}
      </VStack>
    </Center>
  );
}
