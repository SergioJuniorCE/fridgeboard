'use client';

import {useEffect, useState, type CSSProperties} from 'react';
import {usePathname, useRouter} from 'next/navigation';
import {
  Bars3Icon,
  XMarkIcon,
  HomeIcon,
  CalendarIcon,
  ChartBarIcon,
  UserIcon,
  CubeIcon,
} from '@heroicons/react/24/outline';
import {VStack, HStack} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';
import {Button} from '@astryxdesign/core/Button';
import {IconButton} from '@astryxdesign/core/IconButton';
import {Icon} from '@astryxdesign/core/Icon';
import {SideNav, SideNavHeading, SideNavItem, SideNavSection} from '@astryxdesign/core/SideNav';
import {authClient} from '@/lib/auth-client';
import QuickAddSheet from './quick-add-sheet';

const fabStyle: CSSProperties = {
  position: 'fixed',
  top: 'var(--spacing-4)',
  left: 'var(--spacing-4)',
  zIndex: 60,
};

const panelStyle: CSSProperties = {
  position: 'fixed',
  top: 0,
  bottom: 0,
  left: 0,
  width: 'min(320px, 85vw)',
  zIndex: 61,
  backgroundColor: 'var(--color-background-surface)',
  overflowY: 'auto',
};

// Sidebar drawer for landscape/wide screens (authed pages only).
// Hamburger top-left opens it; X, Escape, or tapping a destination closes it.
export default function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const {data: session, isPending} = authClient.useSession();
  const [open, setOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open ]);

  // Close the drawer whenever navigation lands somewhere new.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  if (isPending || !session) return null;

  const go = (href: string) => {
    setSheetOpen(false);
    setOpen(false);
    router.push(href);
  };

  return (
    <>
      <HStack gap={0} style={fabStyle}>
        <IconButton
          label="Open menu"
          tooltip="Menu"
          variant="ghost"
          size="lg"
          icon={<Icon icon={open ? XMarkIcon : Bars3Icon} />}
          onClick={() => setOpen((v) => !v)}
        />
      </HStack>
      {open && (
        <VStack gap={0} style={panelStyle}>
          <SideNav
            header={
              <SideNavHeading
                heading="Yoggan Home"
                headingHref="/"
                icon={<CubeIcon width={24} height={24} />}
              />
            }
            topContent={
              <Button
                label="Quick add"
                variant="primary"
                size="lg"
                onClick={() => setSheetOpen(true)}
              />
            }>
            <SideNavSection title="Menu">
              <SideNavItem
                label="Home"
                icon={HomeIcon}
                href="/"
                isSelected={pathname === '/'}
                size="lg"
              />
              <SideNavItem
                label="Calendar"
                icon={CalendarIcon}
                href="/calendar"
                isSelected={pathname.startsWith('/calendar')}
                size="lg"
              />
              <SideNavItem
                label="Stats"
                icon={ChartBarIcon}
                href="/budgets"
                isSelected={pathname.startsWith('/budgets')}
                size="lg"
              />
              <SideNavItem
                label="Profile"
                icon={UserIcon}
                href="/settings"
                isSelected={pathname.startsWith('/settings')}
                size="lg"
              />
            </SideNavSection>
          </SideNav>
          <Text type="supporting" color="secondary">
            Tap a destination to go there.
          </Text>
        </VStack>
      )}
      <QuickAddSheet open={sheetOpen} onClose={setSheetOpen} onNavigate={go} />
    </>
  );
}
