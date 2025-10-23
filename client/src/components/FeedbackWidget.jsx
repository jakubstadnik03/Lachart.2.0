import React, { useState, useRef } from 'react';
import emailjs from '@emailjs/browser';
import { motion, AnimatePresence } from 'framer-motion';
import { useNotification } from '../context/NotificationContext';
import { logFeedbackSent } from '../utils/eventLogger';

const SERVICE_ID = 'service_sdkyhzd';
const TEMPLATE_ID = 'template_wphmbwc';
const PUBLIC_KEY = 'ChzwROYrWPZuGCms-'; // <- doplň!

const FeedbackWidget = () => {
  const { addNotification } = useNotification();
  const [open, setOpen] = useState(false);
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
      const subject = formData.get('subject') || 'Feedback';
      await logFeedbackSent(subject);
      
      addNotification('Feedback sent! Thank you 🙏', 'success');
      setOpen(false);
    } catch (error) {
      console.error(error);
      addNotification('Failed to send feedback. Try it later or use email.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full bg-primary text-white px-4 py-3 shadow-lg hover:bg-primary-dark focus:outline-none"
        aria-label="Open feedback"
      >
        <img src="/icon/info-white.svg" alt="feedback" className="w-5 h-5" />
        <span className="hidden sm:block">Feedback</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
            onClick={() => !isSubmitting && setOpen(false)}
          >
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 260, damping: 20 }}
              className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-800">Feedback</h3>
                <button
                  type="button"
                  className="text-gray-500 hover:text-gray-700"
                  onClick={() => !isSubmitting && setOpen(false)}
                >
                  ✕
                </button>
              </div>
              <form ref={formRef} onSubmit={sendEmail} className="space-y-4">
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
                    className="w-full min-h-[120px] rounded-md border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-primary focus:outline-none"
                    placeholder="Your feedback..."
                  />
                </div>
                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
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
    </>
  );
};

export default FeedbackWidget;


