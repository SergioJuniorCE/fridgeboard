'use client';

import {useState, type ReactNode, type CSSProperties} from 'react';
import Link from 'next/link';
import {usePathname, useRouter} from 'next/navigation';
import {HomeIcon, CalendarDaysIcon, ShoppingCartIcon, ChartBarIcon, Cog6ToothIcon, PlusIcon} from '@heroicons/react/24/outline';
import {AppShell} from '@astryxdesign/core/AppShell';
import {VStack, HStack} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';
import {IconButton} from '@astryxdesign/core/IconButton';
import {Icon} from '@astryxdesign/core/Icon';
import {authClient} from '@/lib/auth-client';
import QuickAddSheet from './quick-add-sheet';
import {Clock} from './dashboard/clock';

const destinations = [
  {label: 'Today', href: '/', icon: HomeIcon},
  {label: 'Calendar', href: '/calendar', icon: CalendarDaysIcon},
  {label: 'Shopping', href: '/lists', icon: ShoppingCartIcon},
  {label: 'Budget', href: '/budgets', icon: ChartBarIcon},
];

const navLink: CSSProperties = {
  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
  gap: 'var(--spacing-2)', textDecoration: 'none', width: '100%',
  minHeight: 'var(--home-rail-item)', color: 'var(--color-text-primary)',
};

function Destination({item, active}: {item: typeof destinations[number]; active: boolean}) {
  return (
    <Link href={item.href} aria-current={active ? 'page' : undefined}
      style={{...navLink, background: active ? 'var(--home-ink)' : undefined,
        color: active ? 'var(--home-white)' : undefined}}>
      <item.icon width="var(--home-icon-size)" height="var(--home-icon-size)" strokeWidth={1.6} aria-hidden="true" />
      <Text type="supporting" style={{color: 'inherit', fontSize: 'var(--font-size-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em'}}>{item.label}</Text>
    </Link>
  );
}

export default function ResponsiveNav({children}: {children: ReactNode}) {
  const pathname = usePathname();
  const router = useRouter();
  const {data: session, isPending} = authClient.useSession();
  const [sheetOpen, setSheetOpen] = useState(false);
  const publicPage = ['/login', '/signup', '/welcome', '/join', '/~offline'].some(p => pathname.startsWith(p));

  if (isPending || !session || publicPage) return <>{children}</>;

  const links = destinations.map(item => <Destination key={item.href} item={item}
    active={item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)} />);

  return (
    <AppShell variant="wash" height="auto" mobileNav={false} contentPadding={0}>
      <VStack style={{marginLeft: 'var(--home-rail-space)', minHeight: '100dvh',
        paddingBottom: 'var(--home-bottom-space)', background: 'var(--color-background-body)'}}>
        {children}
      </VStack>
      <VStack as="nav" aria-label="Main navigation" gap={0} hAlign="center"
        style={{position: 'fixed', inset: '0 auto 0 0', zIndex: 40, display: 'var(--home-rail-display)',
          width: 'var(--home-rail-width)', background: 'var(--color-background-body)', overflowY: 'auto',
          borderRight: 'var(--home-border-width) solid var(--color-border-emphasized)'}}>
        <Link href="/" aria-label="Yoggan Home" style={{...navLink, minHeight: 'var(--home-rail-width)', borderBottom: 'var(--home-border-width) solid var(--color-border)'}}>
          <Text style={{fontFamily: 'var(--home-serif)', fontSize: 'var(--font-size-3xl)', fontWeight: 500}}>yh.</Text>
        </Link>
        {links}
        <VStack hAlign="center" gap={3} style={{marginTop: 'auto', paddingBlock: 'var(--spacing-6)'}}>
          <IconButton label="Quick add" tooltip="Quick add" variant="primary" size="lg" icon={<Icon icon={PlusIcon} />} onClick={() => setSheetOpen(true)} />
          <IconButton label="Settings" tooltip="Settings" variant="ghost" size="lg" icon={<Icon icon={Cog6ToothIcon} />} onClick={() => router.push('/settings')} />
          <Clock compact />
        </VStack>
      </VStack>
      <HStack as="nav" aria-label="Mobile navigation" justify="evenly" gap={0}
        style={{position: 'fixed', inset: 'auto 0 0', zIndex: 40, display: 'var(--home-tabs-display)',
          background: 'var(--color-background-body)', borderTop: 'var(--home-border-width) solid var(--color-border-emphasized)',
          paddingBottom: 'env(safe-area-inset-bottom)'}}>
        {links.slice(0, 2)}
        <VStack hAlign="center" vAlign="center" gap={1} style={{width: '100%', minHeight: 'var(--home-rail-item)'}}>
          <IconButton label="Quick add" tooltip="Quick add" variant="primary" size="lg" icon={<Icon icon={PlusIcon} />} onClick={() => setSheetOpen(true)} />
          <Text type="supporting" weight="bold">Add</Text>
        </VStack>
        {links.slice(2)}
      </HStack>
      <QuickAddSheet open={sheetOpen} onClose={setSheetOpen} onNavigate={href => {setSheetOpen(false); router.push(href);}} />
    </AppShell>
  );
}
