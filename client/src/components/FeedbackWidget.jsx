import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { submitFeedback } from '../services/api';
import { useNotification } from '../context/NotificationContext';

const FeedbackWidget = () => {
  const { addNotification } = useNotification();
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [values, setValues] = useState({
    subject: '',
    message: '',
    email: ''
  });

  const onChange = (e) => {
    const { name, value } = e.target;
    setValues((prev) => ({ ...prev, [name]: value }));
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    if (!values.message.trim()) {
      addNotification('Please write a message.', 'warning');
      return;
    }
    try {
      setIsSubmitting(true);
      await submitFeedback({
        subject: values.subject || 'Feedback',
        message: values.message,
        email: values.email || undefined,
        page: window.location.pathname
      });
      addNotification('Thanks for your feedback!', 'success');
      setValues({ subject: '', message: '', email: '' });
      setOpen(false);
    } catch (err) {
      addNotification('Submission failed. Please try again.', 'error');
      console.error('Feedback submit error:', err);
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
              <form onSubmit={onSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Subject (optional)</label>
                  <input
                    name="subject"
                    value={values.subject}
                    onChange={onChange}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-primary focus:outline-none"
                    placeholder="Idea, bug, praise…"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Your message</label>
                  <textarea
                    name="message"
                    value={values.message}
                    onChange={onChange}
                    className="w-full min-h-[120px] rounded-md border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-primary focus:outline-none"
                    placeholder="What should we improve? What do you like?"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Contact (optional)</label>
                  <input
                    type="email"
                    name="email"
                    value={values.email}
                    onChange={onChange}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-primary focus:outline-none"
                    placeholder="Email for reply"
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
                    {isSubmitting ? 'Sending…' : 'Send' }
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


