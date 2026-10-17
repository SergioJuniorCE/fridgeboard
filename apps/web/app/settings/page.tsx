// Settings: profile switcher with Adult PIN, own PIN setup, household
// invite links (Admin), sign out.
'use client';

import {useCallback, useEffect, useState, type CSSProperties} from 'react';
import {useRouter} from 'next/navigation';
import {VStack} from '@astryxdesign/core/Layout';
import {Center} from '@astryxdesign/core/Center';
import {Text, Heading} from '@astryxdesign/core/Text';
import {TextInput} from '@astryxdesign/core/TextInput';
import {Button} from '@astryxdesign/core/Button';
import {Section} from '@astryxdesign/core/Section';
import {Link} from '@astryxdesign/core/Link';
import {RadioList, RadioListItem} from '@astryxdesign/core/RadioList';
import {authClient} from '@/lib/auth-client';
import {
  api,
  getActiveProfile,
  getUnlockToken,
  setActiveProfile,
  setUnlockToken,
  type DisplayMember,
} from '@/lib/api';
import {
  readSchemeSetting,
  writeSchemeSetting,
  type ColorSchemeSetting,
} from '@/components/theme-provider';

const pageStyle: CSSProperties = {
  minHeight: '100%',
  backgroundColor: 'var(--color-background-body)',
};
const contentStyle: CSSProperties = {
  width: '100%',
  maxWidth: 560,
};

type Me = {id: string; kind: 'adult' | 'minor'; isAdmin: number; householdId: string};
type Invite = {
  id: string;
  kind: 'adult' | 'minor';
  maxUses: number | null;
  usedCount: number;
  expiresAt: string | null;
};

export default function SettingsPage() {
  const router = useRouter();
  const {data: session, isPending} = authClient.useSession();
  const [members, setMembers] = useState<DisplayMember[]>([]);
  const [me, setMe] = useState<Me | null>(null);
  const [activeProfile, setActive] = useState<string | null>(null);
  const [pinPromptFor, setPinPromptFor] = useState<DisplayMember | null>(null);
  const [pin, setPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [invites, setInvites] = useState<Invite[]>([]);
  const [inviteKind, setInviteKind] = useState('minor');
  const [notice, setNotice] = useState<string | null>(null);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [scheme, setScheme] = useState<ColorSchemeSetting>('auto');

  useEffect(() => {
    setScheme(readSchemeSetting());
  }, []);

  const load = useCallback(async () => {
    const [{members: ms}, {member}] = await Promise.all([
      api.get<{members: DisplayMember[]}>('/api/members'),
      api.get<{member: Me}>('/api/members/me'),
    ]);
    setMembers(ms);
    setMe(member);
    setActive(getActiveProfile() ?? member.id);
    if (member.isAdmin) {
      const {invites: invs} = await api.get<{invites: Invite[]}>(
        `/api/households/${member.householdId}/invites`,
      );
      setInvites(invs);
    }
  }, []);

  useEffect(() => {
    if (isPending) return;
    if (!session) {
      router.replace('/login');
      return;
    }
    load().catch(() => router.replace('/welcome'));
  }, [isPending, session, router, load]);

  const switchProfile = async (memberId: string) => {
    const target = members.find((m) => m.id === memberId);
    if (!target || !me) return;
    setNotice(null);
    // Own profile or a Minor: switch freely.
    if (target.id === me.id || target.kind === 'minor') {
      setActiveProfile(target.id === me.id ? null : target.id);
      setActive(target.id);
      setPinPromptFor(null);
      return;
    }
    // Another Adult: needs their PIN unless already unlocked.
    const unlock = getUnlockToken();
    if (unlock) {
      setActiveProfile(target.id);
      setActive(target.id);
      return;
    }
    setPinPromptFor(target);
  };

  const unlockProfile = async () => {
    if (!pinPromptFor) return;
    try {
      const {token} = await api.post<{token: string}>(
        `/api/members/${pinPromptFor.id}/verify-pin`,
        {pin},
      );
      setUnlockToken(token);
      setActiveProfile(pinPromptFor.id);
      setActive(pinPromptFor.id);
      setPinPromptFor(null);
      setPin('');
    } catch {
      setNotice('Wrong PIN. Try again.');
    }
  };

  const saveOwnPin = async () => {
    if (!/^\d{4,12}$/.test(newPin)) {
      setNotice('PIN must be 4-12 digits.');
      return;
    }
    try {
      await api.post('/api/members/me/pin', {pin: newPin});
      setNewPin('');
      setNotice('PIN saved. It is asked on shared devices.');
    } catch {
      setNotice('Could not save the PIN.');
    }
  };

  const createInvite = async () => {
    if (!me) return;
    try {
      const {invite} = await api.post<{invite: {id: string; token: string}}>(
        `/api/households/${me.householdId}/invites`,
        {kind: inviteKind, maxUses: null, expiresInDays: 30},
      );
      setNewToken(new URL(`/join?token=${encodeURIComponent(invite.token)}`, window.location.origin).href);
      const {invites: invs} = await api.get<{invites: Invite[]}>(
        `/api/households/${me.householdId}/invites`,
      );
      setInvites(invs);
    } catch {
      setNotice('Could not create the invite.');
    }
  };

  const signOut = async () => {
    setActiveProfile(null);
    setUnlockToken(null);
    await authClient.signOut();
    router.push('/login');
  };

  return (
    <Center axis="horizontal" padding={6} style={pageStyle}>
      <VStack gap={4} hAlign="stretch" style={contentStyle}>
        <Heading level={1}>Settings</Heading>
        {notice && (
          <Text type="body" color="secondary">
            {notice}
          </Text>
        )}

        <Section>
          <VStack gap={3}>
            <Heading level={2}>Profile</Heading>
            <Text type="body" color="secondary" size="sm">
              Who is using this device right now? Acting as another Adult needs their PIN.
            </Text>
            {members.length > 0 && activeProfile && (
              <RadioList
                label="Active profile"
                value={activeProfile}
                onChange={switchProfile}>
                {members.map((m) => (
                  <RadioListItem
                    key={m.id}
                    value={m.id}
                    label={m.name}
                    description={`${m.kind}${m.isAdmin ? ' · admin' : ''}`}
                  />
                ))}
              </RadioList>
            )}
            {pinPromptFor && (
              <VStack gap={2}>
                <TextInput
                  label={`PIN for ${pinPromptFor.name}`}
                  type="password"
                  placeholder="4-12 digits"
                  value={pin}
                  onChange={setPin}
                  size="lg"
                />
                <Button label="Unlock profile" variant="primary" size="lg" onClick={unlockProfile} />
              </VStack>
            )}
          </VStack>
        </Section>

        <Section>
          <VStack gap={3}>
            <Heading level={2}>Appearance</Heading>
            <Text type="body" color="secondary" size="sm">
              Auto follows the time of day: light 7:00–19:00, dark at night. This stays on this device.
            </Text>
            <RadioList
              label="Color scheme"
              value={scheme}
              onChange={(v: string) => {
                const next = v as ColorSchemeSetting;
                setScheme(next);
                writeSchemeSetting(next);
              }}>
              <RadioListItem value="auto" label="Auto" description="Light by day, dark by night" />
              <RadioListItem value="light" label="Light" description="Always light" />
              <RadioListItem value="dark" label="Dark" description="Always dark" />
            </RadioList>
          </VStack>
        </Section>

        {me?.kind === 'adult' && (
          <Section>
            <VStack gap={3}>
              <Heading level={2}>My PIN</Heading>
              <Text type="body" color="secondary" size="sm">
                Others need this PIN to act as you on a shared device.
              </Text>
              <TextInput
                label="New PIN"
                type="password"
                placeholder="4-12 digits"
                value={newPin}
                onChange={setNewPin}
                size="lg"
              />
              <Button label="Save PIN" variant="secondary" size="lg" onClick={saveOwnPin} />
            </VStack>
          </Section>
        )}

        {me?.isAdmin === 1 && (
          <Section>
            <VStack gap={3}>
              <Heading level={2}>Invite links</Heading>
              <Text type="body" color="secondary" size="sm">
                Share a link to add someone to this household. Links expire after 30 days.
              </Text>
              <RadioList label="Invite as" value={inviteKind} onChange={setInviteKind}>
                <RadioListItem value="minor" label="Minor" />
                <RadioListItem value="adult" label="Adult" />
              </RadioList>
              <Button label="Create invite link" variant="secondary" size="lg" onClick={createInvite} />
              {newToken && (
                  <VStack gap={2}>
                    <Link href={newToken} style={{overflowWrap: 'anywhere'}}>Open invite link</Link>
                    <TextInput label="Invite link" value={newToken} isReadOnly width="100%" />
                    <Button label="Copy invite link" variant="secondary" onClick={async () => {
                      try {await navigator.clipboard.writeText(newToken); setNotice('Invite link copied.');}
                      catch {setNotice('Copy the link from the field above.');}
                    }} />
                  </VStack>
              )}
              {invites.map((inv) => (
                <Text key={inv.id} type="supporting" color="secondary">
                  {inv.kind} · used {inv.usedCount}
                  {inv.maxUses ? `/${inv.maxUses}` : ''} · expires{' '}
                  {inv.expiresAt ? new Date(inv.expiresAt).toLocaleDateString() : 'never'}
                </Text>
              ))}
            </VStack>
          </Section>
        )}

        <Button label="Sign out" variant="secondary" size="lg" onClick={signOut} />
      </VStack>
    </Center>
  );
}
