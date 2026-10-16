'use client';

import {useEffect, useState} from 'react';
import {api} from './api';

export type Me = {
  id: string;
  kind: 'adult' | 'minor';
  isAdmin: number;
  householdId: string;
};

// Own member profile for role gating (server still enforces every rule).
export function useMe() {
  const [me, setMe] = useState<Me | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    api
      .get<{member: Me}>('/api/members/me')
      .then(({member}) => setMe(member))
      .catch(() => setMe(null))
      .finally(() => setReady(true));
  }, []);
  return {me, ready};
}
