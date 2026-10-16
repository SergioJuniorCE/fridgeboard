// Join via shareable link: /join?token=… — prefilled, one tap to join.
'use client';

import {Suspense, useState, type CSSProperties} from 'react';
import {useRouter, useSearchParams} from 'next/navigation';
import {CubeIcon} from '@heroicons/react/24/outline';
import {VStack} from '@astryxdesign/core/Layout';
import {Center} from '@astryxdesign/core/Center';
import {Text, Heading} from '@astryxdesign/core/Text';
import {TextInput} from '@astryxdesign/core/TextInput';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {Link} from '@astryxdesign/core/Link';
import {Icon} from '@astryxdesign/core/Icon';
import {authClient} from '@/lib/auth-client';
import {api} from '@/lib/api';

const pageStyle: CSSProperties = {
  minHeight: '100%',
  backgroundColor: 'var(--color-background-body)',
};
const contentStyle: CSSProperties = {
  width: '100%',
  maxWidth: 400,
};

function JoinForm() {
  const router = useRouter();
  const params = useSearchParams();
  const {data: session, isPending} = authClient.useSession();
  const [token, setToken] = useState(params.get('token') ?? '');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleJoin = async () => {
    const clean = token.trim().split('token=')[1] ?? token.trim();
    if (!clean) {
      setErrorMessage('Paste an invite link token.');
      return;
    }
    setIsLoading(true);
    setErrorMessage(null);
    try {
      await api.post('/api/households/join', {token: clean});
      router.push('/');
    } catch {
      setErrorMessage('That link did not work. It may be expired or fully used.');
      setIsLoading(false);
    }
  };

  if (isPending) {
    return (
      <Center axis="both" padding={6} style={pageStyle}>
        <Text type="body" color="secondary">
          Loading…
        </Text>
      </Center>
    );
  }

  if (!session) {
    return (
      <Center axis="both" padding={6} style={pageStyle}>
        <VStack gap={4} hAlign="center" style={contentStyle}>
          <Card padding={8} width="100%">
            <VStack gap={4} hAlign="center">
              <Heading level={2}>Join your household</Heading>
              <Text type="body" color="secondary" size="sm">
                Log in or sign up first, then come back to this link.
              </Text>
              <Button label="Log in" variant="primary" size="lg" onClick={() => router.push('/login')} />
              <Text type="supporting" color="secondary">
                New here?{' '}
                <Link href="/signup" type="supporting">
                  Sign up
                </Link>
              </Text>
            </VStack>
          </Card>
        </VStack>
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
              <Heading level={2}>Join your household</Heading>
              <Text type="body" color="secondary" size="sm">
                One tap and you are in
              </Text>
            </VStack>

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
              variant="primary"
              size="lg"
              isLoading={isLoading}
              onClick={handleJoin}
            />
          </VStack>
        </Card>
      </VStack>
    </Center>
  );
}

export default function JoinPage() {
  return (
    <Suspense>
      <JoinForm />
    </Suspense>
  );
}
