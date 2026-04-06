import React from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';

const Modal = ({ isOpen, onClose, title, children, bodyRef, bottomFade = false }) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-gray-900/60"
        aria-label="Close dialog"
        onClick={onClose}
      />

      <div
        className="relative z-10 flex max-h-[min(92dvh,100vh-0.5rem)] w-full max-w-6xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:max-h-[min(90vh,56rem)] sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-100 px-4 py-3 sm:items-center sm:px-6 sm:py-4">
          <h3
            id="modal-title"
            className="min-w-0 flex-1 pr-2 text-base font-semibold leading-snug text-gray-900 sm:text-lg"
          >
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary"
            aria-label="Close"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        <div className="relative flex min-h-0 flex-1 flex-col">
          <div
            ref={bodyRef}
            className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom,0px))] sm:px-6 sm:pt-5 sm:pb-[max(1.25rem,env(safe-area-inset-bottom,0px))]"
          >
            {children}
          </div>
          {bottomFade ? (
            <div
              className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] h-12 bg-gradient-to-t from-white from-40% to-transparent sm:h-14"
              aria-hidden
            />
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default Modal;
