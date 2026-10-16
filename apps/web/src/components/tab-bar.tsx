'use client';

import {useState, type CSSProperties} from 'react';
import {usePathname, useRouter} from 'next/navigation';
import {
  HomeIcon,
  CalendarIcon,
  PlusIcon,
  ChartBarIcon,
  UserIcon,
} from '@heroicons/react/24/outline';
import {VStack, HStack} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';
import {IconButton} from '@astryxdesign/core/IconButton';
import {Icon} from '@astryxdesign/core/Icon';
import {Section} from '@astryxdesign/core/Section';
import {authClient} from '@/lib/auth-client';
import QuickAddSheet from './quick-add-sheet';

const barStyle: CSSProperties = {
  position: 'fixed',
  left: 0,
  right: 0,
  bottom: 0,
  zIndex: 50,
  backgroundColor: 'var(--color-background-surface)',
  paddingBottom: 'max(var(--spacing-2), env(safe-area-inset-bottom))',
};

function Tab({
  label,
  icon,
  href,
  active,
  onNavigate,
}: {
  label: string;
  icon: typeof HomeIcon;
  href: string;
  active: boolean;
  onNavigate: (href: string) => void;
}) {
  return (
    <VStack gap={0} hAlign="center">
      <IconButton
        label={label}
        tooltip={label}
        variant={active ? 'primary' : 'ghost'}
        size="lg"
        icon={<Icon icon={icon} />}
        onClick={() => onNavigate(href)}
      />
      <Text
        type="supporting"
        color={active ? undefined : 'secondary'}
        weight={active ? 'bold' : undefined}>
        {label}
      </Text>
    </VStack>
  );
}

// Bottom tab bar (authed pages only): Home, Calendar, quick-add,
// Stats, Profile. Plus an in-flow spacer so page bottoms clear the bar.
export default function TabBar() {
  const router = useRouter();
  const pathname = usePathname();
  const {data: session, isPending} = authClient.useSession();
  const [sheetOpen, setSheetOpen] = useState(false);

  if (isPending || !session) return null;

  const go = (href: string) => {
    setSheetOpen(false);
    router.push(href);
  };

  return (
    <>
      <Section variant="transparent" minHeight={96} padding={0} />
      <HStack justify="evenly" paddingBlock={2} style={barStyle}>
        <Tab
          label="Home"
          icon={HomeIcon}
          href="/"
          active={pathname === '/'}
          onNavigate={go}
        />
        <Tab
          label="Calendar"
          icon={CalendarIcon}
          href="/calendar"
          active={pathname.startsWith('/calendar')}
          onNavigate={go}
        />
        <VStack gap={0} hAlign="center">
          <IconButton
            label="Quick add"
            tooltip="Quick add"
            variant="primary"
            size="lg"
            elevation="med"
            icon={<Icon icon={PlusIcon} />}
            onClick={() => setSheetOpen(true)}
          />
          <Text type="supporting" color="secondary">
            Add
          </Text>
        </VStack>
        <Tab
          label="Stats"
          icon={ChartBarIcon}
          href="/budgets"
          active={pathname.startsWith('/budgets')}
          onNavigate={go}
        />
        <Tab
          label="Profile"
          icon={UserIcon}
          href="/settings"
          active={pathname.startsWith('/settings')}
          onNavigate={go}
        />
      </HStack>
      <QuickAddSheet open={sheetOpen} onClose={setSheetOpen} onNavigate={go} />
    </>
  );
}
