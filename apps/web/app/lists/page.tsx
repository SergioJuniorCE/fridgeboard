// Shopping lists as tall vertical cards, one per store.
// Checkbox = bought; unchecking returns the item to needed.
'use client';

import {useCallback, useEffect, useState, type CSSProperties} from 'react';
import {PlusIcon} from '@heroicons/react/24/outline';
import {VStack, HStack, StackItem} from '@astryxdesign/core/Layout';
import {Center} from '@astryxdesign/core/Center';
import {Text, Heading} from '@astryxdesign/core/Text';
import {TextInput} from '@astryxdesign/core/TextInput';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {Link} from '@astryxdesign/core/Link';
import {IconButton} from '@astryxdesign/core/IconButton';
import {CheckboxList, CheckboxListItem} from '@astryxdesign/core/CheckboxList';
import {authClient} from '@/lib/auth-client';
import {api} from '@/lib/api';
import {useMe} from '@/lib/use-me';

const pageStyle: CSSProperties = {
  minHeight: '100%',
  backgroundColor: 'var(--color-background-body)',
};
const contentStyle: CSSProperties = {
  width: '100%',
  maxWidth: 1200,
};

type ShoppingList = {
  id: string;
  title: string;
  color: string;
  icon: string;
  spendLimit: string | null;
  createdAt: string;
};

type ListItem = {
  id: string;
  title: string;
  quantity: string;
  store: string | null;
  status: 'needed' | 'in_cart' | 'bought';
  createdAt: string;
};

type CardData = {
  list: ShoppingList;
  items: ListItem[];
  spentThisMonth: string;
};

function itemDescription(item: ListItem): string | undefined {
  const parts: string[] = [];
  if (item.quantity && item.quantity !== '1') parts.push(`×${item.quantity}`);
  if (item.store) parts.push(item.store);
  if (item.status === 'in_cart') parts.push('in cart');
  return parts.length > 0 ? parts.join(' · ') : undefined;
}

export default function ListsPage() {
  const {data: session, isPending} = authClient.useSession();
  const [cards, setCards] = useState<CardData[]>([]);
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [itemTitle, setItemTitle] = useState('');
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [limit, setLimit] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const {me} = useMe();
  const isAdult = me?.kind === 'adult';

  const load = useCallback(async () => {
    const {lists} = await api.get<{lists: ShoppingList[]}>('/api/lists');
    const details = await Promise.all(
      lists.map(async (list) => {
        const detail = await api.get<{
          items: ListItem[];
          spentThisMonth: string;
        }>(`/api/lists/${list.id}`);
        return {list, items: detail.items, spentThisMonth: detail.spentThisMonth};
      }),
    );
    setCards(details);
  }, []);

  useEffect(() => {
    if (isPending) return;
    if (!session) {
      window.location.assign('/login');
      return;
    }
    load().catch(() => setNotice('Could not load lists.'));
  }, [isPending, session, load]);

  const toggleItems = async (listId: string, values: string[]) => {
    const card = cards.find((c) => c.list.id === listId);
    if (!card) return;
    const bought = new Set(card.items.filter((i) => i.status === 'bought').map((i) => i.id));
    const next = new Set(values);
    const jobs: Promise<unknown>[] = [];
    for (const item of card.items) {
      if (next.has(item.id) && !bought.has(item.id)) {
        jobs.push(api.patch(`/api/lists/${listId}/items/${item.id}`, {status: 'bought'}));
      } else if (!next.has(item.id) && bought.has(item.id)) {
        jobs.push(api.patch(`/api/lists/${listId}/items/${item.id}`, {status: 'needed'}));
      }
    }
    await Promise.all(jobs);
    await load();
  };

  const addItem = async (listId: string) => {
    if (!itemTitle.trim()) {
      setNotice('Give the item a title.');
      return;
    }
    try {
      await api.post(`/api/lists/${listId}/items`, {title: itemTitle.trim()});
      setItemTitle('');
      setAddingTo(null);
      setNotice(null);
      await load();
    } catch {
      setNotice('Could not add the item.');
    }
  };

  const createList = async () => {
    if (!title.trim()) {
      setNotice('Give the list a title.');
      return;
    }
    try {
      await api.post('/api/lists', {
        title: title.trim(),
        spendLimit: limit.trim() === '' ? null : Number(limit),
      });
      setTitle('');
      setLimit('');
      setCreating(false);
      setNotice(null);
      await load();
    } catch {
      setNotice('Could not create the list (Adults only).');
    }
  };

  return (
    <Center axis="horizontal" padding={6} style={pageStyle}>
      <VStack gap={4} hAlign="stretch" style={contentStyle}>
        <Heading level={1}>Shopping lists</Heading>
        {notice && (
          <Text type="body" color="secondary">
            {notice}
          </Text>
        )}

        <HStack gap={3} isScrollable vAlign="stretch">
          {cards.map(({list, items, spentThisMonth}) => {
            const boughtIds = items.filter((i) => i.status === 'bought').map((i) => i.id);
            return (
              <StackItem key={list.id} size="static">
                <Card padding={4} width={280} minHeight={440}>
                  <VStack gap={3} hAlign="stretch">
                    <HStack hAlign="between" vAlign="center">
                      <Link href={`/lists/${list.id}`}>
                        <Heading level={3}>{list.title}</Heading>
                      </Link>
                      <IconButton
                        icon={<PlusIcon width={20} height={20} />}
                        label={`Add item to ${list.title}`}
                        tooltip="Add item"
                        onClick={() => {
                          setAddingTo(list.id);
                          setItemTitle('');
                        }}
                      />
                    </HStack>
                    {addingTo === list.id && (
                      <VStack gap={2}>
                        <TextInput
                          label="New item"
                          isLabelHidden
                          placeholder="e.g. Milk 1L"
                          value={itemTitle}
                          onChange={setItemTitle}
                          size="lg"
                        />
                        <Button label="Add" variant="primary" size="lg" onClick={() => addItem(list.id)} />
                      </VStack>
                    )}
                    {items.length === 0 && addingTo !== list.id ? (
                      <Text type="body" color="secondary">
                        Nothing here yet — tap + to add the first item.
                      </Text>
                    ) : (
                      <CheckboxList
                        label={`${list.title} items`}
                        isLabelHidden
                        value={boughtIds}
                        changeAction={(values) => toggleItems(list.id, values)}
                        density="spacious">
                        {items.map((item) => (
                          <CheckboxListItem
                            key={item.id}
                            value={item.id}
                            label={item.title}
                            description={itemDescription(item)}
                          />
                        ))}
                      </CheckboxList>
                    )}
                    {list.spendLimit && (
                      <Text type="supporting" color="secondary">
                        €{spentThisMonth} of €{list.spendLimit} this month
                      </Text>
                    )}
                  </VStack>
                </Card>
              </StackItem>
            );
          })}

          {isAdult === true && (
            <StackItem size="static">
              <Card padding={4} width={280} minHeight={440}>
                {creating ? (
                  <VStack gap={2} hAlign="stretch">
                    <Heading level={3}>New list</Heading>
                    <TextInput
                      label="Title"
                      isLabelHidden
                      placeholder="e.g. Weekend market"
                      value={title}
                      onChange={setTitle}
                      size="lg"
                    />
                    <TextInput
                      label="Spend limit (optional, €)"
                      isLabelHidden
                      placeholder="Spend limit, € (optional)"
                      value={limit}
                      onChange={setLimit}
                      size="lg"
                    />
                    <Button label="Create list" variant="primary" size="lg" onClick={createList} />
                  </VStack>
                ) : (
                  <VStack gap={2} hAlign="center">
                    <Button
                      label="Add new list"
                      variant="secondary"
                      size="lg"
                      onClick={() => {
                        setTitle('');
                        setLimit('');
                        setCreating(true);
                      }}
                    />
                  </VStack>
                )}
              </Card>
            </StackItem>
          )}
        </HStack>
      </VStack>
    </Center>
  );
}
