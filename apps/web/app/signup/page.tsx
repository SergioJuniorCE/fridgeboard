// Signup page: same login-card frame, creates the Better Auth account.
'use client';

import {useEffect, useState, type CSSProperties} from 'react';
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

export default function SignupPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [bootstrap, setBootstrap] = useState<boolean | null>(null);

  // Open signup exists only for the first user ever; everyone else is invite-only.
  useEffect(() => {
    api
      .get<{open: boolean}>('/api/auth/bootstrap')
      .then(({open}) => setBootstrap(open))
      .catch(() => setBootstrap(false));
  }, []);

  const handleSignup = async () => {
    if (!name.trim() || !email || password.length < 8) {
      setErrorMessage('Enter your name, email, and a password (8+ chars).');
      return;
    }
    setIsLoading(true);
    setErrorMessage(null);
    const {error} = await authClient.signUp.email({name: name.trim(), email, password});
    setIsLoading(false);
    if (error) {
      setErrorMessage('Setup could not be completed. If the first account already exists, use an invite link instead.');
      return;
    }
    // Full reload so the session cookie is in place before the welcome gate runs.
    window.location.assign('/welcome');
  };

  if (bootstrap === null) {
    return (
      <Center axis="both" padding={6} style={pageStyle}>
        <Text type="body" color="secondary">
          Loading…
        </Text>
      </Center>
    );
  }

  if (!bootstrap) {
    return (
      <Center axis="both" padding={6} style={pageStyle}>
        <VStack gap={4} hAlign="center" style={contentStyle}>
          <Card padding={8} width="100%">
            <VStack gap={4} hAlign="center">
              <Heading level={2}>Invite only</Heading>
              <Text type="body" color="secondary" size="sm">
                This household grows by invite link only. Ask an Admin for one, then join.
              </Text>
              <Button label="I have a link" variant="primary" size="lg" onClick={() => window.location.assign('/join')} />
              <Text type="supporting" color="secondary">
                Already have an account?{' '}
                <Link href="/login" type="supporting">
                  Log in
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
              <Heading level={2}>Set up Yoggan Home</Heading>
              <Text type="body" color="secondary" size="sm">
                Create the first account. Everyone else will join by invitation.
              </Text>
            </VStack>

            <VStack gap={2}>
              <TextInput
                label="Name"
                isLabelHidden
                placeholder="Your name"
                value={name}
                onChange={setName}
                onEnter={handleSignup}
                size="lg"
              />
              <TextInput
                label="Email"
                isLabelHidden
                type="email"
                placeholder="you@home.com"
                value={email}
                onChange={setEmail}
                onEnter={handleSignup}
                size="lg"
              />
              <TextInput
                label="Password"
                isLabelHidden
                placeholder="Password (8+ characters)"
                type="password"
                value={password}
                onEnter={handleSignup}
                onChange={(v: string) => {
                  setPassword(v);
                  setErrorMessage(null);
                }}
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
            </VStack>

            <Button
              label="Create first account"
              variant="primary"
              size="lg"
              isLoading={isLoading}
              onClick={handleSignup}
            />

            <VStack hAlign="center">
              <Text type="supporting" color="secondary">
                Already have an account?{' '}
                <Link href="/login" type="supporting">
                  Log in
                </Link>
              </Text>
            </VStack>
          </VStack>
        </Card>
      </VStack>
    </Center>
  );
}
