// List detail: items by status, add/advance/remove, log bought items as
// expenses (auto-creates price records), edit list (Adults), delete (Admin).
'use client';

import {use, useCallback, useEffect, useState, type CSSProperties} from 'react';
import {useRouter} from 'next/navigation';
import {VStack, HStack} from '@astryxdesign/core/Layout';
import {Center} from '@astryxdesign/core/Center';
import {Text, Heading} from '@astryxdesign/core/Text';
import {TextInput} from '@astryxdesign/core/TextInput';
import {Button} from '@astryxdesign/core/Button';
import {Section} from '@astryxdesign/core/Section';
import {List, ListItem} from '@astryxdesign/core/List';
import {authClient} from '@/lib/auth-client';
import {api} from '@/lib/api';
import {useMe} from '@/lib/use-me';

const pageStyle: CSSProperties = {
  minHeight: '100%',
  backgroundColor: 'var(--color-background-body)',
};
const contentStyle: CSSProperties = {
  width: '100%',
  maxWidth: 640,
};

type Item = {
  id: string;
  title: string;
  quantity: string;
  store: string | null;
  status: 'needed' | 'in_cart' | 'bought';
  createdAt: string;
};

type Detail = {
  list: {id: string; title: string; color: string; icon: string; spendLimit: string | null};
  items: Item[];
  spentThisMonth: string;
};

const NEXT_STATUS: Record<string, {to: string; label: string} | null> = {
  needed: {to: 'in-cart', label: 'To cart'},
  in_cart: {to: 'bought', label: 'Bought'},
  bought: null,
};

export default function ListDetailPage({params}: {params: Promise<{id: string}>}) {
  const {id} = use(params);
  const router = useRouter();
  const {data: session, isPending} = authClient.useSession();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [itemTitle, setItemTitle] = useState('');
  const [itemQty, setItemQty] = useState('');
  const [itemStore, setItemStore] = useState('');
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const {me} = useMe();
  const isAdult = me?.kind === 'adult';
  const isAdmin = me?.isAdmin === 1;
  const [editTitle, setEditTitle] = useState('');
  const [editLimit, setEditLimit] = useState('');
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    const d = await api.get<Detail>(`/api/lists/${id}`);
    setDetail(d);
    setEditTitle((prev) => (editing ? prev : d.list.title));
    setEditLimit((prev) => (editing ? prev : (d.list.spendLimit ?? '')));
  }, [id, editing]);

  useEffect(() => {
    if (isPending) return;
    if (!session) {
      router.replace('/login');
      return;
    }
    load().catch(() => setNotice('Could not load this list.'));
  }, [isPending, session, router, load]);

  const addItem = async () => {
    if (!itemTitle.trim()) {
      setNotice('Give the item a title.');
      return;
    }
    try {
      await api.post(`/api/lists/${id}/items`, {
        title: itemTitle.trim(),
        quantity: itemQty.trim() || '1',
        store: itemStore.trim() || null,
      });
      setItemTitle('');
      setItemQty('');
      setItemStore('');
      setNotice(null);
      await load();
    } catch {
      setNotice('Could not add the item.');
    }
  };

  const setStatus = async (itemId: string, status: string) => {
    try {
      await api.patch(`/api/lists/${id}/items/${itemId}`, {status});
      await load();
    } catch {
      setNotice('Could not update the item.');
    }
  };

  const removeItem = async (itemId: string) => {
    try {
      await api.del(`/api/lists/${id}/items/${itemId}`);
      await load();
    } catch {
      setNotice('Could not remove the item.');
    }
  };

  const logExpense = async (item: Item) => {
    const raw = (amounts[item.id] ?? '').replace(',', '.');
    const amount = Number(raw);
    if (!Number.isFinite(amount) || amount <= 0) {
      setNotice(`Enter what "${item.title}" cost first.`);
      return;
    }
    try {
      await api.post('/api/budgets/expenses', {
        amount,
        spentOn: new Date().toISOString().slice(0, 10),
        note: item.title,
        listItemId: item.id,
      });
      setAmounts((prev) => ({...prev, [item.id]: ''}));
      setNotice(`Logged €${amount.toFixed(2)} for ${item.title}.`);
    } catch {
      setNotice('Could not log the expense (Adults only).');
    }
  };

  const deleteList = async () => {
    try {
      await api.del(`/api/lists/${id}`);
      router.push('/lists');
    } catch {
      setNotice('Could not delete the list (Admin only).');
    }
  };

  const saveListEdits = async () => {
    if (!editTitle.trim()) {
      setNotice('Give the list a title.');
      return;
    }
    const limitRaw = editLimit.trim();
    const spendLimit = limitRaw === '' ? null : Number(limitRaw.replace(',', '.'));
    if (spendLimit !== null && (!Number.isFinite(spendLimit) || spendLimit < 0)) {
      setNotice('Spend limit must be 0 or more, or empty.');
      return;
    }
    try {
      await api.patch(`/api/lists/${id}`, {title: editTitle.trim(), spendLimit});
      setEditing(false);
      setNotice(null);
      await load();
    } catch {
      setNotice('Could not save the list (Adults only).');
    }
  };

  if (!detail) {
    return (
      <Center axis="both" padding={6} style={pageStyle}>
        <Text type="body" color="secondary">
          {notice ?? 'Loading…'}
        </Text>
      </Center>
    );
  }

  const groups: {status: Item['status']; heading: string}[] = [
    {status: 'needed', heading: 'Needed'},
    {status: 'in_cart', heading: 'In cart'},
    {status: 'bought', heading: 'Bought'},
  ];

  return (
    <Center axis="horizontal" padding={6} style={pageStyle}>
      <VStack gap={4} hAlign="stretch" style={contentStyle}>
        <HStack gap={2}>
          <VStack gap={0}>
            <Heading level={1}>{detail.list.title}</Heading>
            {detail.list.spendLimit && (
              <Text type="body" color="secondary">
                €{detail.spentThisMonth} of €{detail.list.spendLimit} this month
              </Text>
            )}
          </VStack>
        </HStack>
        {notice && (
          <Text type="body" color="secondary">
            {notice}
          </Text>
        )}

        {groups.map((g) => {
          const items = detail.items.filter((i) => i.status === g.status);
          if (items.length === 0) return null;
          return (
            <Section key={g.status}>
              <VStack gap={2}>
                <Heading level={2}>{g.heading}</Heading>
                <List hasDividers density="spacious">
                  {items.map((item) => {
                    const next = NEXT_STATUS[item.status];
                    return (
                      <ListItem
                        key={item.id}
                        label={`${item.title} × ${item.quantity}`}
                        description={item.store ?? undefined}
                        endContent={
                          <HStack gap={1}>
                            {next && (
                              <Button
                                label={next.label}
                                variant="secondary"
                                size="lg"
                                onClick={() => setStatus(item.id, next.to)}
                              />
                            )}
                            {item.status === 'bought' && isAdult && (
                              <HStack gap={1}>
                                <TextInput
                                  label={`Price for ${item.title}`}
                                  isLabelHidden
                                  placeholder="€"
                                  size="lg"
                                  value={amounts[item.id] ?? ''}
                                  onChange={(v: string) =>
                                    setAmounts((prev) => ({...prev, [item.id]: v}))
                                  }
                                />
                                <Button
                                  label="Log"
                                  variant="secondary"
                                  size="lg"
                                  onClick={() => logExpense(item)}
                                />
                              </HStack>
                            )}
                            <Button
                              label="Remove"
                              variant="secondary"
                              size="lg"
                              onClick={() => removeItem(item.id)}
                            />
                          </HStack>
                        }
                      />
                    );
                  })}
                </List>
              </VStack>
            </Section>
          );
        })}

        <Section>
          <VStack gap={3}>
            <Heading level={2}>Add item</Heading>
            <TextInput
              label="Title"
              placeholder="e.g. Milk 1L"
              value={itemTitle}
              onChange={setItemTitle}
              size="lg"
            />
            <HStack gap={2}>
              <TextInput
                label="Quantity"
                placeholder="1"
                size="lg"
                value={itemQty}
                onChange={setItemQty}
              />
              <TextInput
                label="Store"
                placeholder="e.g. Lidl"
                size="lg"
                value={itemStore}
                onChange={setItemStore}
              />
            </HStack>
            <Button label="Add item" variant="primary" size="lg" onClick={addItem} />
          </VStack>
        </Section>

        {isAdult && (
          <Section>
            <VStack gap={3}>
              <Heading level={2}>Edit list</Heading>
              <TextInput
                label="Title"
                value={editTitle}
                onChange={setEditTitle}
                size="lg"
              />
              <TextInput
                label="Spend limit € (empty for none)"
                value={editLimit}
                onChange={setEditLimit}
                size="lg"
              />
              <Button label="Save changes" variant="secondary" size="lg" onClick={saveListEdits} />
            </VStack>
          </Section>
        )}

        {isAdmin && (
          <Button label="Delete list" variant="secondary" size="lg" onClick={deleteList} />)}
      </VStack>
    </Center>
  );
}
