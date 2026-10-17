// Shopping lists as tall vertical cards, one per store.
// Checkbox = bought; long-press/right-click an item for Delete.
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
import {ContextMenu} from '@astryxdesign/core/ContextMenu';
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
// Row fills the viewport below the page header; cards stretch to match.
// dvh math (not theme spacing) is the only way to express "viewport minus chrome".
const boardStyle: CSSProperties = {
  height: 'calc(100dvh - 230px)',
  minHeight: 480,
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
  const [confirmClearList, setConfirmClearList] = useState<string | null>(null);
  const [confirmClearBoard, setConfirmClearBoard] = useState(false);
  const [busy, setBusy] = useState(false);
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

  const deleteItem = async (listId: string, itemId: string) => {
    try {
      await api.del(`/api/lists/${listId}/items/${itemId}`);
      setNotice(null);
      await load();
    } catch {
      setNotice('Could not delete the item.');
    }
  };

  const clearList = async (listId: string) => {
    if (confirmClearList !== listId) {
      setConfirmClearList(listId);
      setConfirmClearBoard(false);
      return;
    }
    const card = cards.find((c) => c.list.id === listId);
    if (!card) return;
    setBusy(true);
    try {
      await Promise.all(
        card.items.map((item) => api.del(`/api/lists/${listId}/items/${item.id}`)),
      );
      setConfirmClearList(null);
      setNotice(null);
      await load();
    } catch {
      setNotice('Could not clear the list.');
    } finally {
      setBusy(false);
    }
  };

  const clearBoard = async () => {
    if (!confirmClearBoard) {
      setConfirmClearBoard(true);
      setConfirmClearList(null);
      return;
    }
    setBusy(true);
    try {
      await Promise.all(
        cards.flatMap((card) =>
          card.items.map((item) => api.del(`/api/lists/${card.list.id}/items/${item.id}`)),
        ),
      );
      setConfirmClearBoard(false);
      setNotice(null);
      await load();
    } catch {
      setNotice('Could not clear the board.');
    } finally {
      setBusy(false);
    }
  };

  const addItem = async (listId: string, closeAfter: boolean) => {
    if (!itemTitle.trim()) {
      setNotice('Give the item a title.');
      return;
    }
    try {
      await api.post(`/api/lists/${listId}/items`, {title: itemTitle.trim()});
      setItemTitle('');
      if (closeAfter) setAddingTo(null);
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

  const totalItems = cards.reduce((sum, card) => sum + card.items.length, 0);

  return (
    <Center axis="horizontal" padding={6} style={pageStyle}>
      <VStack gap={4} hAlign="stretch" style={contentStyle}>
        <HStack hAlign="between" vAlign="center">
          <Heading level={1}>Shopping lists</Heading>
          {totalItems > 0 && (
            <Button
              label={confirmClearBoard ? 'Tap again to confirm' : 'Clear board'}
              variant="secondary"
              size="lg"
              isLoading={busy}
              onClick={clearBoard}
            />
          )}
        </HStack>
        {notice && (
          <Text type="body" color="secondary">
            {notice}
          </Text>
        )}

        <HStack gap={3} isScrollable vAlign="stretch" style={boardStyle}>
          {cards.map(({list, items, spentThisMonth}) => {
            const boughtIds = items.filter((i) => i.status === 'bought').map((i) => i.id);
            return (
              <StackItem key={list.id} size="static">
                <Card padding={4} width={280} minHeight={440} height="100%">
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
                          setAddingTo(addingTo === list.id ? null : list.id);
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
                          onEnter={() => addItem(list.id, false)}
                          size="lg"
                        />
                        <Button label="Save" variant="primary" size="lg" onClick={() => addItem(list.id, true)} />
                        <Button
                          label="Save + add another"
                          variant="secondary"
                          size="lg"
                          onClick={() => addItem(list.id, false)}
                        />
                      </VStack>
                    )}
                    {items.length === 0 && addingTo !== list.id ? (
                      <Text type="body" color="secondary">
                        Nothing here yet — tap + to add the first item.
                      </Text>
                    ) : (
                      <StackItem size="fill" isScrollable>
                        <CheckboxList
                          label={`${list.title} items`}
                          isLabelHidden
                          value={boughtIds}
                          changeAction={(values) => toggleItems(list.id, values)}
                          density="spacious">
                          {items.map((item) => (
                            <ContextMenu
                              key={item.id}
                              presentation="adaptive"
                              items={[
                                {
                                  label: 'Delete item',
                                  onClick: () => deleteItem(list.id, item.id),
                                },
                              ]}>
                              <CheckboxListItem
                                value={item.id}
                                label={item.title}
                                description={itemDescription(item)}
                              />
                            </ContextMenu>
                          ))}
                        </CheckboxList>
                      </StackItem>
                    )}
                    {list.spendLimit && (
                      <Text type="supporting" color="secondary">
                        €{spentThisMonth} of €{list.spendLimit} this month
                      </Text>
                    )}
                    {items.length > 0 && (
                      <Button
                        label={confirmClearList === list.id ? 'Tap again to confirm' : 'Clear list'}
                        variant="ghost"
                        size="lg"
                        isLoading={busy && confirmClearList === list.id}
                        onClick={() => clearList(list.id)}
                      />
                    )}
                  </VStack>
                </Card>
              </StackItem>
            );
          })}

          {isAdult === true && (
            <StackItem size="static">
              <Card padding={4} width={280} minHeight={440} height="100%">
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
