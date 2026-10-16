import type {CSSProperties, ReactNode} from 'react';
import {Text} from '@astryxdesign/core/Text';
import {HStack} from '@astryxdesign/core/Layout';

export const eyebrow: CSSProperties = {fontSize: 'var(--font-size-xs)', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase'};
export const serif: CSSProperties = {fontFamily: 'var(--home-serif)', fontWeight: 400, letterSpacing: '-0.035em', lineHeight: 1.08};
export const panel: CSSProperties = {background: 'var(--color-background-card)', borderRadius: 'var(--radius-container)', padding: 'var(--spacing-6)', minWidth: 0};
export const rule: CSSProperties = {borderBottom: 'var(--home-border-width) solid var(--color-border-emphasized)', paddingBottom: 'var(--spacing-4)'};
const colors = ['blue', 'pink', 'teal', 'gold'] as const;
export function memberColor(index: number) {return `var(--home-${colors[index % colors.length]})`;}
export function memberTint(index: number) {return `var(--home-${colors[index % colors.length]}-soft)`;}

export function Eyebrow({children, style}: {children: ReactNode; style?: CSSProperties}) {
  return <Text type="label" style={{...eyebrow, ...style}}>{children}</Text>;
}

export function MemberDot({name, index = 0}: {name: string; index?: number}) {
  return <HStack hAlign="center" vAlign="center" aria-hidden="true" style={{flexShrink: 0, width: 'var(--home-avatar-size)', height: 'var(--home-avatar-size)', borderRadius: '50%', background: memberTint(index), color: memberColor(index)}}>
    <Text weight="bold" style={{color: 'inherit'}}>{name.trim().charAt(0).toUpperCase()}</Text>
  </HStack>;
}

// Date-only Google events use local calendar dates, not UTC midnight.
export function eventDate(value: string) {return new Date(value.length === 10 ? `${value}T00:00:00` : value);}
export function sameDay(a: Date, b: Date) {return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();}
export function eventTime(value: string) {return value.length === 10 ? 'All day' : eventDate(value).toLocaleTimeString('en-US', {hour: 'numeric', minute: '2-digit'});}
