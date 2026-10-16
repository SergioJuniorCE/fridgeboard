// Welcome: after signup, either create the household (first Adult becomes
// Admin) or join one with a shareable link. Redirects home if already a member.
'use client';

import {useEffect, useState, type CSSProperties} from 'react';
import {useRouter} from 'next/navigation';
import {CubeIcon} from '@heroicons/react/24/outline';
import {VStack} from '@astryxdesign/core/Layout';
import {Center} from '@astryxdesign/core/Center';
import {Text, Heading} from '@astryxdesign/core/Text';
import {TextInput} from '@astryxdesign/core/TextInput';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {Divider} from '@astryxdesign/core/Divider';
import {Icon} from '@astryxdesign/core/Icon';
import {authClient} from '@/lib/auth-client';
import {api, type DisplayMember} from '@/lib/api';

const pageStyle: CSSProperties = {
  minHeight: '100%',
  backgroundColor: 'var(--color-background-body)',
};
const contentStyle: CSSProperties = {
  width: '100%',
  maxWidth: 400,
};

export default function WelcomePage() {
  const router = useRouter();
  const {data: session, isPending} = authClient.useSession();
  const [checking, setChecking] = useState(true);
  const [householdName, setHouseholdName] = useState('');
  const [token, setToken] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isPending) return;
    if (!session) {
      router.replace('/login');
      return;
    }
    api
      .get<{members: DisplayMember[]}>('/api/members')
      .then(({members}) => {
        if (members.length > 0) router.replace('/');
        else setChecking(false);
      })
      .catch(() => setChecking(false));
  }, [isPending, session, router]);

  const handleCreate = async () => {
    if (!householdName.trim()) {
      setErrorMessage('Give your household a name.');
      return;
    }
    setIsLoading(true);
    setErrorMessage(null);
    try {
      await api.post('/api/households', {name: householdName.trim()});
      router.push('/');
    } catch {
      setErrorMessage('Could not create the household. Try again.');
      setIsLoading(false);
    }
  };

  const handleJoin = async () => {
    if (!token.trim()) {
      setErrorMessage('Paste an invite link token.');
      return;
    }
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const clean = token.trim().split('token=')[1] ?? token.trim();
      await api.post('/api/households/join', {token: clean});
      router.push('/');
    } catch {
      setErrorMessage('That link did not work. Check it and try again.');
      setIsLoading(false);
    }
  };

  if (isPending || checking) {
    return (
      <Center axis="both" padding={6} style={pageStyle}>
        <Text type="body" color="secondary">
          Loading…
        </Text>
      </Center>
    );
  }

  return (
    <Center axis="both" padding={6} style={pageStyle}>
      <VStack gap={4} hAlign="center" style={contentStyle}>
        <VStack gap={2} hAlign="center">
          <Icon icon={CubeIcon} size="lg" />
          <Text type="body" weight="bold" size="lg">
            Yoggan Home
          </Text>
        </VStack>

        <Card padding={8} width="100%">
          <VStack gap={4} hAlign="stretch">
            <VStack gap={1} hAlign="center">
              <Heading level={2}>Set up your household</Heading>
              <Text type="body" color="secondary" size="sm">
                Create one, or join with a link
              </Text>
            </VStack>

            <VStack gap={2}>
              <TextInput
                label="Household name"
                isLabelHidden
                placeholder="e.g. The Millers"
                value={householdName}
                onChange={setHouseholdName}
                size="lg"
              />
              <Button
                label="Create household"
                variant="primary"
                size="lg"
                isLoading={isLoading}
                onClick={handleCreate}
              />
            </VStack>

            <Divider label="Or join" />

            <VStack gap={2}>
              <TextInput
                label="Invite token"
                isLabelHidden
                placeholder="Paste invite link or token"
                value={token}
                onChange={setToken}
                size="lg"
                status={
                  errorMessage
                    ? {
                        type: 'error',
                        message: errorMessage,
                      }
                    : undefined
                }
              />
              <Button
                label="Join household"
                variant="secondary"
                size="lg"
                isLoading={isLoading}
                onClick={handleJoin}
              />
            </VStack>
          </VStack>
        </Card>
      </VStack>
    </Center>
  );
}
