import {ArrowUpRightIcon, ShoppingCartIcon} from '@heroicons/react/24/outline';
import {ClickableCard} from '@astryxdesign/core/ClickableCard';
import {HStack, VStack} from '@astryxdesign/core/Layout';
import {Text} from '@astryxdesign/core/Text';
import {Button} from '@astryxdesign/core/Button';
import {List, ListItem} from '@astryxdesign/core/List';
import type {BudgetSummary, ShoppingItem} from './use-dashboard';
import {Eyebrow, panel, serif} from './primitives';

export function ShoppingSummary({items, listCount, unavailable}: {items: ShoppingItem[]; listCount: number; unavailable: boolean}) {
  return <VStack gap={3} style={panel}>
    <HStack justify="between" vAlign="center"><Eyebrow>Shopping</Eyebrow><ShoppingCartIcon width="var(--spacing-5)" height="var(--spacing-5)" aria-hidden="true" /></HStack>
    <HStack gap={2} style={{alignItems: 'baseline'}}><Text style={{fontFamily: 'var(--home-numbers)', fontSize: 'var(--font-size-4xl)', lineHeight: 1}}>{unavailable ? '—' : items.length}</Text><Text type="supporting" color="secondary">items to get</Text></HStack>
    {unavailable ? <Text type="supporting" color="secondary">Some lists could not be loaded.</Text> : items.length ? <List density="compact">
      {items.slice(0, 3).map(item => <ListItem key={item.id} label={item.title} href={`/lists/${item.listId}`} />)}
    </List> : <Text type="supporting" color="secondary">All stocked up. Add something to your next shop.</Text>}
    <Button label={listCount ? `View ${listCount === 1 ? 'shopping list' : 'all lists'}` : 'Create a list'} href="/lists" variant="ghost" size="sm" endContent={<ArrowUpRightIcon width="var(--spacing-4)" />} style={{alignSelf: 'start', marginTop: 'auto'}} />
  </VStack>;
}

export function BudgetPanel({budget}: {budget: BudgetSummary | null}) {
  const total = budget?.categories.reduce((sum, category) => sum + Number(category.amount), 0) ?? 0;
  const spent = budget ? budget.categories.reduce((sum, category) => sum + Number(category.spent), Number(budget.uncategorizedSpent)) : 0;
  const percent = total ? Math.min(100, Math.round(spent / total * 100)) : 0;
  return <ClickableCard href="/budgets" label="View household budget" padding={6} style={{background: 'var(--color-background-card)'}}>
    <VStack gap={3} style={{height: '100%'}}>
      <HStack justify="between"><Eyebrow>This month</Eyebrow><ArrowUpRightIcon width="var(--spacing-5)" height="var(--spacing-5)" aria-hidden="true" /></HStack>
      <Text as="h2" style={{...serif, fontSize: 'var(--font-size-3xl)'}}>Household budget</Text>
      <Text type="supporting" color="secondary">{!budget ? 'Open your budget to see this month’s spending.' : total ? `${percent}% of your monthly budget used` : 'Set your monthly budget and keep spending in view.'}</Text>
      <HStack role="progressbar" aria-label="Monthly budget used" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} style={{marginTop: 'auto', height: 'var(--spacing-2)', background: 'var(--color-border)', borderRadius: 'var(--radius-element)', overflow: 'hidden'}}>
        <HStack style={{width: `${percent}%`, background: 'var(--color-text-primary)', borderRadius: 'inherit'}} />
      </HStack>
    </VStack>
  </ClickableCard>;
}
