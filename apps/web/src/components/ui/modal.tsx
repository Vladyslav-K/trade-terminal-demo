import { useEffect, useRef, type ReactNode } from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

export function Modal({ isOpen, onClose, title, children }: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;

    if (!dialog) {
      return;
    }

    if (isOpen && !dialog.open) {
      dialog.showModal();
    }

    if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className="m-auto max-h-[calc(100vh-64px)] w-fit max-w-[calc(100vw-64px)] min-w-[480px] overflow-auto rounded border border-line bg-panel text-ink backdrop:bg-surface/70"
    >
      <header className="flex h-10 items-center border-b border-line px-4">
        <h2 className="text-[13px] font-semibold">{title}</h2>
      </header>
      <div className="p-4">{children}</div>
    </dialog>
  );
}
