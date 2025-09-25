import { useEffect } from 'react';
import './Modal.css';

export type ModalProps = {
  isOpen: boolean;
  title?: string;
  onClose: () => void;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
};

export default function Modal({ isOpen, title, onClose, children, footer, className, bodyClassName }: ModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  function onOverlayClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  const modalClass = ['modal', className].filter(Boolean).join(' ');
  const bodyClass = ['modal__body', bodyClassName].filter(Boolean).join(' ');

  return (
    <div className="modalOverlay" role="dialog" aria-modal="true" onClick={onOverlayClick}>
      <div className={modalClass} role="document">
        {title && (
          <div className="modal__header">
            <h2 className="modal__title">{title}</h2>
          </div>
        )}
        <div className={bodyClass}>{children}</div>
        {footer && (
          <div className="modal__footer">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
