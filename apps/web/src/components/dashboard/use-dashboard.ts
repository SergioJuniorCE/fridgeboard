'use client';

import {useEffect, useState} from 'react';
import {api, ApiError, getActiveProfile, type DisplayMember} from '@/lib/api';
import {fetchWeather, type Weather} from '@/lib/weather';

export type CalendarEvent = {id: string; title: string; start: string; end: string; source: 'family' | 'personal'};
export type ShoppingItem = {id: string; title: string; status: string; listId: string; listTitle: string};
type ShoppingList = {id: string; title: string; items: ShoppingItem[] | null};
export type BudgetSummary = {categories: {id: string; name: string; amount: string; spent: string}[]; uncategorizedSpent: string};
type Dashboard = {
  members: DisplayMember[] | null;
  activeMemberId: string | null;
  events: CalendarEvent[] | null;
  calendarState: 'loading' | 'connected' | 'disconnected' | 'error';
  lists: ShoppingList[] | null;
  budget: BudgetSummary | null;
  weather: Weather | null;
  weatherState: 'loading' | 'ready' | 'error';
  error: string | null;
};

const initial: Dashboard = {members: null, activeMemberId: null, events: null, calendarState: 'loading', lists: null, budget: null, weather: null, weatherState: 'loading', error: null};

export function useDashboard(enabled: boolean) {
  const [data, setData] = useState<Dashboard>(initial);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let current = true;
    const update = (patch: Partial<Dashboard>) => {if (current) setData(d => ({...d, ...patch}));};
    update({error: null, calendarState: 'loading', weatherState: 'loading'});
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    const to = new Date(from);
    to.setDate(to.getDate() + 7);

    api.get<{members: DisplayMember[]}>('/api/members')
      .then(({members}) => update({members}))
      .catch(() => update({error: 'Your household could not be loaded. Please try again.'}));
    api.get<{member: {id: string}}>('/api/members/me')
      .then(({member}) => update({activeMemberId: getActiveProfile() ?? member.id}))
      .catch(() => update({activeMemberId: getActiveProfile()}));
    api.get<{events: CalendarEvent[]}>(`/api/calendar/events?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`)
      .then(({events}) => update({events: events.sort((a, b) => Date.parse(a.start) - Date.parse(b.start)), calendarState: 'connected'}))
      .catch(error => update({events: null, calendarState: error instanceof ApiError && error.status === 503 ? 'disconnected' : 'error'}));
    api.get<{lists: {id: string; title: string}[]}>('/api/lists')
      .then(async ({lists}) => {
        const details = await Promise.all(lists.map(async list => {
          try {
            const {items} = await api.get<{items: {id: string; title: string; status: string}[]}>(`/api/lists/${list.id}`);
            return {...list, items: items.map(item => ({...item, listId: list.id, listTitle: list.title}))};
          } catch {return {...list, items: null};}
        }));
        update({lists: details});
      })
      .catch(() => update({lists: null}));
    api.get<BudgetSummary>('/api/budgets').then(budget => update({budget})).catch(() => update({budget: null}));
    fetchWeather().then(weather => update({weather, weatherState: 'ready'})).catch(() => update({weather: null, weatherState: 'error'}));
    return () => {current = false;};
  }, [enabled, attempt]);
  return {...data, retry: () => setAttempt(a => a + 1)};
}
