'use client';

import {VStack} from '@astryxdesign/core/Layout';
import {Button} from '@astryxdesign/core/Button';
import {BottomSheet} from '@astryxdesign/core/BottomSheet';

// Shared quick-add sheet used by both the bottom bar and the sidebar.
export default function QuickAddSheet({
  open,
  onClose,
  onNavigate,
}: {
  open: boolean;
  onClose: (open: boolean) => void;
  onNavigate: (href: string) => void;
}) {
  const go = (href: string) => {
    onClose(false);
    onNavigate(href);
  };
  return (
    <BottomSheet isOpen={open} onOpenChange={onClose} label="Quick add" height="hug">
      <VStack gap={2}>
        <Button
          label="Shopping item"
          variant="secondary"
          size="lg"
          onClick={() => go('/lists')}
        />
        <Button
          label="Family event"
          variant="secondary"
          size="lg"
          onClick={() => go('/calendar')}
        />
        <Button
          label="Log expense"
          variant="secondary"
          size="lg"
          onClick={() => go('/budgets')}
        />
      </VStack>
    </BottomSheet>
  );
}
