'use client';

import {useEffect, useState, type CSSProperties} from 'react';
import {usePathname, useRouter} from 'next/navigation';
import {Cog6ToothIcon} from '@heroicons/react/24/outline';
import {HStack} from '@astryxdesign/core/Layout';
import {Avatar} from '@astryxdesign/core/Avatar';
import {IconButton} from '@astryxdesign/core/IconButton';
import {Icon} from '@astryxdesign/core/Icon';
import {authClient} from '@/lib/auth-client';
import {api, getActiveProfile, type DisplayMember} from '@/lib/api';

const fabStyle: CSSProperties = {
  position: 'fixed',
  top: 'var(--spacing-4)',
  right: 'var(--spacing-4)',
  zIndex: 50,
};

// Floating profile avatar + settings, top-right on every authed page.
// Hidden on auth pages (no session). Avatar opens profile settings.
export default function ProfileFab() {
  const router = useRouter();
  const pathname = usePathname();
  const {data: session, isPending} = authClient.useSession();
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    if (isPending || !session) return;
    api
      .get<{members: DisplayMember[]}>('/api/members')
      .then(({members}) => {
        const activeId = getActiveProfile();
        const active = members.find((m) => m.id === activeId) ?? null;
        setName(active?.name ?? session.user?.name ?? null);
      })
      .catch(() => setName(session.user?.name ?? null));
  }, [isPending, session]);

  if (isPending || !session || pathname === '/') return null;

  return (
    <HStack gap={2} style={fabStyle}>
      {name && <Avatar name={name} size="lg" href="/settings" />}
      <IconButton
        label="Settings"
        tooltip="Settings"
        variant="ghost"
        size="lg"
        icon={<Icon icon={Cog6ToothIcon} />}
        onClick={() => router.push('/settings')}
      />
    </HStack>
  );
}
