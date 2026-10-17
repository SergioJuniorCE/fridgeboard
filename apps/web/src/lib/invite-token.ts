export function inviteToken(value: string): string {
  const clean = value.trim();
  if (/^[A-Za-z0-9_-]+$/.test(clean)) return clean;
  try {return new URL(clean, 'https://yoggan.invalid').searchParams.get('token') ?? '';}
  catch {return '';}
}
