// Budgets: monthly envelopes, manual expenses, price history, receipts.
'use client';

import {useCallback, useEffect, useState, type CSSProperties} from 'react';
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
import {readReceiptPhoto} from '@/lib/receipt-ocr';

const pageStyle: CSSProperties = {
  minHeight: '100%',
  backgroundColor: 'var(--color-background-body)',
};
const contentStyle: CSSProperties = {
  width: '100%',
  maxWidth: 640,
};

type Category = {id: string; name: string; amount: string; spent: string};
type Price = {price: string; storeNorm: string | null; observedOn: string};

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function BudgetsPage() {
  const router = useRouter();
  const {data: session, isPending} = authClient.useSession();
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [categories, setCategories] = useState<Category[]>([]);
  const [uncategorized, setUncategorized] = useState('0');
  const [notice, setNotice] = useState<string | null>(null);
  // Expense form
  const [expAmount, setExpAmount] = useState('');
  const [expCategory, setExpCategory] = useState('');
  const [expNote, setExpNote] = useState('');
  // New category
  const [catName, setCatName] = useState('');
  const [catAmount, setCatAmount] = useState('');
  // Price lookup
  const [priceTitle, setPriceTitle] = useState('');
  const [priceStore, setPriceStore] = useState('');
  const [prices, setPrices] = useState<Price[] | null>(null);
  // Receipts (ephemeral this session)
  const [receiptId, setReceiptId] = useState<string | null>(null);
  const [receiptTotal, setReceiptTotal] = useState('');
  const [receiptDate, setReceiptDate] = useState('');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [reading, setReading] = useState(false);
  const {me} = useMe();
  const isAdult = me?.kind === 'adult';

  const load = useCallback(
    async (m: string) => {
      const data = await api.get<{
        categories: Category[];
        uncategorizedSpent: string;
      }>(`/api/budgets?month=${m}`);
      setCategories(data.categories);
      setUncategorized(data.uncategorizedSpent);
    },
    [],
  );

  useEffect(() => {
    if (isPending) return;
    if (!session) {
      router.replace('/login');
      return;
    }
    load(month).catch(() => setNotice('Could not load budgets.'));
  }, [isPending, session, router, load, month]);

  const addCategory = async () => {
    const amount = Number(catAmount.replace(',', '.'));
    if (!catName.trim() || !Number.isFinite(amount) || amount < 0) {
      setNotice('Enter a category name and an amount of 0 or more.');
      return;
    }
    try {
      await api.post('/api/budgets/categories', {
        name: catName.trim(),
        month: `${month}-01`,
        amount,
      });
      setCatName('');
      setCatAmount('');
      setNotice(null);
      await load(month);
    } catch {
      setNotice('Could not add the category (Adults only).');
    }
  };

  const logExpense = async (preset?: {amount?: number; note?: string; receiptId?: string; spentOn?: string}) => {
    const amount = Number((preset?.amount ?? expAmount).toString().replace(',', '.'));
    if (!Number.isFinite(amount) || amount <= 0) {
      setNotice('Enter an amount above 0.');
      return;
    }
    try {
      await api.post('/api/budgets/expenses', {
        categoryId: expCategory || null,
        amount,
        spentOn: preset?.spentOn ?? new Date().toISOString().slice(0, 10),
        note: preset?.note ?? (expNote.trim() === '' ? null : expNote.trim()),
        receiptId: preset?.receiptId ?? null,
      });
      setExpAmount('');
      setExpNote('');
      setNotice(`Logged €${amount.toFixed(2)}.`);
      await load(month);
    } catch {
      setNotice('Could not log the expense (Adults only).');
    }
  };

  const lookupPrices = async () => {
    if (!priceTitle.trim()) {
      setNotice('Enter an item title to look up.');
      return;
    }
    try {
      const q = new URLSearchParams({title: priceTitle.trim()});
      if (priceStore.trim()) q.set('store', priceStore.trim());
      const {records} = await api.get<{records: Price[]}>(`/api/budgets/prices?${q}`);
      setPrices(records);
      setNotice(records.length === 0 ? 'No price history for that item yet.' : null);
    } catch {
      setNotice('Price lookup failed.');
    }
  };

  const uploadReceipt = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append('photo', file);
      const {receipt} = await api.postForm<{receipt: {id: string}}>(
        '/api/receipts',
        form,
      );
      setReceiptId(receipt.id);
      setReceiptFile(file);
      setReceiptTotal('');
      setReceiptDate('');
      setNotice('Receipt saved. Read the total from the photo, enhance with AI, or type it by hand.');
    } catch {
      setNotice('Upload failed (photo, JPG/PNG/WebP, max 10MB).');
    } finally {
      setUploading(false);
    }
  };

  const readPhoto = async () => {
    if (!receiptFile || !receiptId) return;
    setReading(true);
    try {
      const guess = await readReceiptPhoto(receiptFile);
      if (guess.total !== undefined) setReceiptTotal(String(guess.total));
      if (guess.purchasedOn) {
        setReceiptDate(guess.purchasedOn);
        await api.patch(`/api/receipts/${receiptId}`, {purchasedOn: guess.purchasedOn});
      }
      if (guess.total === undefined && !guess.purchasedOn) {
        setNotice('Could not read this photo. Enter the total by hand.');
      } else {
        setNotice('Photo read on this device. Check the total before using it.');
      }
    } catch {
      setNotice('Photo reading failed (needs internet on first use). Enter the total by hand.');
    } finally {
      setReading(false);
    }
  };

  const enhanceReceipt = async () => {
    if (!receiptId) return;
    setUploading(true);
    try {
      const data = await api.post<{total?: number; purchasedOn?: string}>(
        `/api/receipts/${receiptId}/enhance`,
        {},
      );
      if (data.total) setReceiptTotal(String(data.total));
      setNotice('AI read the receipt. Review the total, then use it for an expense.');
      await load(month);
    } catch {
      setNotice('AI enhance is unavailable (needs a server API key). Enter the total by hand.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <Center axis="horizontal" padding={6} style={pageStyle}>
      <VStack gap={4} hAlign="stretch" style={contentStyle}>
        <HStack gap={2}>
          <VStack gap={0}>
            <Heading level={1}>Budgets</Heading>
            <Text type="body" color="secondary">
              {month} · uncategorized €{uncategorized}
            </Text>
          </VStack>
        </HStack>
        {notice && (
          <Text type="body" color="secondary">
            {notice}
          </Text>
        )}

        <Section>
          <VStack gap={3}>
            <HStack gap={2}>
              <Button
                label="← Prev"
                variant="secondary"
                size="lg"
                onClick={() => setMonth((m) => shiftMonth(m, -1))}
              />
              <Button
                label="Next →"
                variant="secondary"
                size="lg"
                onClick={() => setMonth((m) => shiftMonth(m, 1))}
              />
            </HStack>
            <List hasDividers density="spacious">
              {categories.map((cat) => {
                const spent = Number(cat.spent);
                const budget = Number(cat.amount);
                const pct = budget > 0 ? Math.min(100, Math.round((spent / budget) * 100)) : 0;
                return (
                  <ListItem
                    key={cat.id}
                    label={cat.name}
                    description={`€${cat.spent} of €${cat.amount} · ${pct}%`}
                  />
                );
              })}
            </List>
            {isAdult && (
              <HStack gap={2}>
                <TextInput
                  label="New category"
                  placeholder="e.g. Pets"
                  size="lg"
                  value={catName}
                  onChange={setCatName}
                />
                <TextInput
                  label="Amount €"
                  placeholder="0"
                  size="lg"
                  value={catAmount}
                  onChange={setCatAmount}
                />
                <Button label="Add" variant="secondary" size="lg" onClick={addCategory} />
              </HStack>
            )}
          </VStack>
        </Section>

        {isAdult && (
          <Section>
            <VStack gap={3}>
              <Heading level={2}>Log expense</Heading>
            <HStack gap={2}>
              <TextInput
                label="Amount €"
                placeholder="e.g. 42.50"
                size="lg"
                value={expAmount}
                onChange={setExpAmount}
              />
              <TextInput
                label="Note"
                placeholder="What was it?"
                size="lg"
                value={expNote}
                onChange={setExpNote}
              />
            </HStack>
            <TextInput
              label="Category id (optional)"
              placeholder="Paste a category id, or leave empty"
              size="lg"
              value={expCategory}
              onChange={setExpCategory}
            />
            <Button label="Log expense" variant="primary" size="lg" onClick={() => logExpense()} />
          </VStack>
        </Section>
        )}

        <Section>
          <VStack gap={3}>
            <Heading level={2}>Price history</Heading>
            <HStack gap={2}>
              <TextInput
                label="Item"
                placeholder="e.g. Milk 1L"
                size="lg"
                value={priceTitle}
                onChange={setPriceTitle}
              />
              <TextInput
                label="Store (optional)"
                placeholder="e.g. Lidl"
                size="lg"
                value={priceStore}
                onChange={setPriceStore}
              />
            </HStack>
            <Button label="Look up" variant="secondary" size="lg" onClick={lookupPrices} />
            {prices && prices.length > 0 && (
              <List hasDividers density="spacious">
                {prices.map((p, i) => (
                  <ListItem
                    key={i}
                    label={`€${p.price}`}
                    description={`${p.storeNorm ?? 'any store'} · ${String(p.observedOn).slice(0, 10)}`}
                  />
                ))}
              </List>
            )}
          </VStack>
        </Section>

        <Section>
          <VStack gap={3}>
            <Heading level={2}>Receipts</Heading>
            <Text type="body" color="secondary" size="sm">
              Snap a receipt, optionally enhance it with AI, then log it as an expense.
            </Text>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => uploadReceipt(e.target.files?.[0])}
            />
            {receiptId && (
              <VStack gap={2}>
                <HStack gap={2}>
                  <TextInput
                    label="Total €"
                    placeholder="e.g. 42.50"
                    size="lg"
                    value={receiptTotal}
                    onChange={setReceiptTotal}
                  />
                  <TextInput
                    label="Date (YYYY-MM-DD)"
                    placeholder="e.g. 2026-10-15"
                    size="lg"
                    value={receiptDate}
                    onChange={setReceiptDate}
                  />
                </HStack>
                <HStack gap={2}>
                  <Button
                    label={reading ? 'Reading…' : 'Read total from photo'}
                    variant="secondary"
                    size="lg"
                    onClick={readPhoto}
                  />
                  <Button
                    label={uploading ? 'Working…' : 'Enhance with AI'}
                    variant="secondary"
                    size="lg"
                    onClick={enhanceReceipt}
                  />
                </HStack>
                {isAdult && (
                  <Button
                    label="Use for expense"
                    variant="primary"
                    size="lg"
                    onClick={() =>
                      logExpense({
                        amount: Number(receiptTotal.replace(',', '.')),
                        note: 'Receipt',
                        receiptId,
                        spentOn: /^\d{4}-\d{2}-\d{2}$/.test(receiptDate)
                          ? receiptDate
                          : undefined,
                      })
                    }
                  />
                )}
              </VStack>
            )}
          </VStack>
        </Section>
      </VStack>
    </Center>
  );
}
