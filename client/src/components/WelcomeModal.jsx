import React, { useRef, useState } from 'react';
import emailjs from '@emailjs/browser';
import { motion, AnimatePresence } from 'framer-motion';
import { useNotification } from '../context/NotificationContext';
import { logFeedbackSent } from '../utils/eventLogger';

const SERVICE_ID = 'service_sdkyhzd';
const TEMPLATE_ID = 'template_wphmbwc';
const PUBLIC_KEY = 'ChzwROYrWPZuGCms-'; // <- doplň!

const WelcomeModal = ({ open, onClose }) => {
  const { addNotification } = useNotification();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const formRef = useRef();

  const sendEmail = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await emailjs.sendForm(
        SERVICE_ID,
        TEMPLATE_ID,
        formRef.current,
        PUBLIC_KEY
      );
      
      // Log feedback event
      const formData = new FormData(formRef.current);
      const subject = formData.get('subject') || 'Welcome Feedback';
      await logFeedbackSent(subject);
      
      addNotification('Feedback sent! Thank you 🙏', 'success');
      onClose?.();
    } catch (error) {
      console.error(error);
      addNotification('Failed to send feedback. Try it later or use email.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[12000] bg-black/40 flex items-center justify-center p-4"
          onClick={() => !isSubmitting && onClose?.()}
        >
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 20, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 20 }}
            className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h3 className="text-xl font-semibold text-gray-900">Welcome to LaChart</h3>
                <p className="text-sm text-gray-500">by Jakub Stádník</p>
              </div>
              <button
                type="button"
                className="text-gray-500 hover:text-gray-700"
                onClick={() => !isSubmitting && onClose?.()}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="prose prose-sm max-w-none text-gray-700 mb-5">
              <p className="hidden sm:block">
                Hi! I'm Jakub Stádník. This is my small passion project to help athletes
                analyze their lactate curve and view test values clearly in a chart. The
                app is still in active development, so some parts may not be perfect yet.
              </p>
              <p className="sm:hidden">
                Hi! I'm Jakub Stádník. This app helps athletes analyze their lactate curve.
                It's still in development, so some parts may not be perfect yet.
              </p>
              <p className="hidden sm:block">
                If something doesn't work as expected or you have an idea that would make
                LaChart better, I'd love to hear from you. Your feedback really helps me
                prioritize improvements.
              </p>
              <p className="sm:hidden">
                If something doesn't work or you have ideas, I'd love to hear from you.
              </p>
              <div className="mt-2 sm:mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-xs text-gray-700 mb-2">
                  <strong>Enjoying LaChart?</strong> If the app helps you, consider supporting its development:
                </p>
                <a
                  href="https://buymeacoffee.com/lachart"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-amber-500 hover:bg-amber-600 text-white text-xs font-medium transition-colors"
                >
                  <span className="text-sm">☕</span>
                  Support on Buy Me a Coffee
                </a>
              </div>
              <p className="mt-2 sm:mt-4">
                Thank you for trying LaChart and enjoy exploring your data!
              </p>
            </div>

            <form ref={formRef} onSubmit={sendEmail} className="space-y-3">
              <div>
                <label className="block text-sm text-gray-600 mb-1">Name (optional)</label>
                <input
                  name="name"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-primary focus:outline-none"
                  placeholder="Your name"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Email (optional)</label>
                <input
                  type="email"
                  name="email"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-primary focus:outline-none"
                  placeholder="Reply-to email (optional)"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Message *</label>
                <textarea
                  name="message"
                  required
                  className="w-full min-h-[100px] rounded-md border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-primary focus:outline-none"
                  placeholder="Your feedback..."
                />
              </div>
              <div className="flex items-center justify-end gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => onClose?.()}
                  className="px-4 py-2 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
                  disabled={isSubmitting}
                >
                  Close
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-md bg-primary text-white hover:bg-primary-dark disabled:opacity-60"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Sending…' : 'Send'}
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default WelcomeModal;


