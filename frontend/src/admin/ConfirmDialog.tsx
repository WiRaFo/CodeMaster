import * as Dialog from '@radix-ui/react-dialog';
import { useState, type ReactNode } from 'react';

/**
 * Подтверждение опасного действия (F-154): открыть доступ, снять с публикации, удалить, вернуть на доработку.
 * Если нужен комментарий, кнопка подтверждения неактивна, пока он пуст.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  danger,
  withComment,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  withComment?: string;
  onConfirm: (comment: string) => void;
  onCancel: () => void;
}) {
  const [comment, setComment] = useState('');
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setComment('');
          onCancel();
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-30 bg-black/50" />
        <Dialog.Content role="alertdialog" className="fixed left-1/2 top-1/2 z-40 w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-md border border-border bg-surface p-5 text-text">
          <Dialog.Title className="mb-2 text-xl font-bold">{title}</Dialog.Title>
          <Dialog.Description asChild>
            <div className="mb-4">{description}</div>
          </Dialog.Description>
          {withComment ? (
            <div className="admin-field">
              <label htmlFor="confirm-comment">{withComment}</label>
              <textarea id="confirm-comment" className="input min-h-24" value={comment} onChange={(e) => setComment(e.target.value)} />
            </div>
          ) : null}
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className={danger ? 'btn-primary bg-danger' : 'btn-primary'}
              disabled={Boolean(withComment) && !comment.trim()}
              onClick={() => {
                const text = comment.trim();
                setComment('');
                onConfirm(text);
              }}
            >
              {confirmLabel}
            </button>
            <Dialog.Close className="btn-secondary">Отмена</Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
