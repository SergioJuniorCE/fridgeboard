// Signup page: same login-card frame, creates the Better Auth account.
'use client';

import {useState, type CSSProperties} from 'react';
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
      setErrorMessage('Could not create the account. Try another email.');
      return;
    }
    // Full reload so the session cookie is in place before the welcome gate runs.
    window.location.assign('/welcome');
  };

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
              <Heading level={2}>Create your account</Heading>
              <Text type="body" color="secondary" size="sm">
                First up — who is this?
              </Text>
            </VStack>

            <VStack gap={2}>
              <TextInput
                label="Name"
                isLabelHidden
                placeholder="Your name"
                value={name}
                onChange={setName}
                size="lg"
              />
              <TextInput
                label="Email"
                isLabelHidden
                type="email"
                placeholder="you@home.com"
                value={email}
                onChange={setEmail}
                size="lg"
              />
              <TextInput
                label="Password"
                isLabelHidden
                placeholder="Password (8+ characters)"
                type="password"
                value={password}
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
              label="Sign up"
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
