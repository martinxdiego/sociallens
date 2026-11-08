import { useRef, type ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, CircleHelp } from 'lucide-react';

export function Modal({
  title,
  description,
  children,
  onClose,
}: {
  title: string;
  description: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const opener = useRef(
    document.activeElement instanceof HTMLElement ? document.activeElement : null
  );
  return (
    <Dialog.Root
      open
      onOpenChange={open => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="sl-overlay" />
        <Dialog.Content
          className="sl-modal"
          onCloseAutoFocus={event => {
            event.preventDefault();
            if (opener.current?.isConnected) opener.current.focus();
          }}
        >
          <Dialog.Title>{title}</Dialog.Title>
          <Dialog.Description>{description}</Dialog.Description>
          <Dialog.Close className="sl-icon-button sl-modal-close" aria-label="Schliessen">
            <X size={20} />
          </Dialog.Close>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="sl-empty">
      <span className="sl-empty-symbol">
        <CircleHelp size={25} />
      </span>
      <h2>{title}</h2>
      <p>{children}</p>
      {action}
    </div>
  );
}

export function ConfirmDialog({
  title,
  description,
  onConfirm,
  onClose,
}: {
  title: string;
  description: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal title={title} description={description} onClose={onClose}>
      <div className="sl-actions">
        <button onClick={onClose}>Abbrechen</button>
        <button className="sl-danger" onClick={onConfirm}>
          Endgültig löschen
        </button>
      </div>
    </Modal>
  );
}
