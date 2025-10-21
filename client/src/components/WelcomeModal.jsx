import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { submitFeedback } from '../services/api';
import { useNotification } from '../context/NotificationContext';

const WelcomeModal = ({ open, onClose }) => {
  const { addNotification } = useNotification();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [values, setValues] = useState({ subject: '', message: '', email: '' });

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
      const payload = {
        subject: values.subject || 'Welcome Feedback',
        message: values.message,
        email: values.email || undefined,
        page: window.location.pathname
      };
      
      console.log('Submitting welcome feedback:', payload);
      const res = await submitFeedback(payload);
      console.log('Welcome feedback response:', res);
      
      addNotification('Thanks for your feedback!', 'success');
      setValues({ subject: '', message: '', email: '' });
      onClose?.();
    } catch (err) {
      console.error('Welcome feedback submit error:', err);
      console.error('Error response:', err?.response);
      console.error('Error status:', err?.response?.status);
      console.error('Error data:', err?.response?.data);
      
      let errorMessage = 'Failed to send feedback';
      
      if (err?.response?.status === 400) {
        errorMessage = 'Please check your message and try again';
      } else if (err?.response?.status === 500) {
        errorMessage = 'Server error. Please try again later';
      } else if (err?.code === 'NETWORK_ERROR' || err?.message?.includes('Network Error') || err?.code === 'ECONNABORTED') {
        errorMessage = 'Connection timeout. The server is not responding';
      } else if (err?.response?.data?.message) {
        errorMessage = err.response.data.message;
      } else if (err?.message) {
        errorMessage = err.message;
      }
      
      addNotification(`Submission failed: ${errorMessage}`, 'error');
      
      // Offer fallback email option for critical errors
      if (err?.response?.status >= 500 || err?.code === 'NETWORK_ERROR' || err?.message?.includes('Network Error') || err?.code === 'ECONNABORTED') {
        const fallbackEmail = 'jakub.stadnik@seznam.cz';
        const emailSubject = encodeURIComponent(`[LaChart Welcome Feedback] ${values.subject || 'Welcome Feedback'}`);
        const emailBody = encodeURIComponent(
          `Message: ${values.message}\n\n` +
          `From: ${values.email || 'anonymous'}\n` +
          `Page: ${window.location.pathname}\n` +
          `Time: ${new Date().toLocaleString()}`
        );
        const mailtoLink = `mailto:${fallbackEmail}?subject=${emailSubject}&body=${emailBody}`;
        
        // Show fallback option immediately
        // eslint-disable-next-line no-alert
        if (window.confirm('The feedback system is currently unavailable. Would you like to send your feedback via email instead?')) {
          window.open(mailtoLink, '_blank');
        }
      }
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
              <p>
                Hi! I’m Jakub Stádník. This is my small passion project to help athletes
                analyze their lactate curve and view test values clearly in a chart. The
                app is still in active development, so some parts may not be perfect yet.
              </p>
              <p>
                If something doesn’t work as expected or you have an idea that would make
                LaChart better, I’d love to hear from you. Your feedback really helps me
                prioritize improvements.
              </p>
              <p>
                Thank you for trying LaChart and enjoy exploring your data!
              </p>
            </div>

            <form onSubmit={onSubmit} className="space-y-3">
              <div>
                <label className="block text-sm text-gray-600 mb-1">Subject (optional)</label>
                <input
                  name="subject"
                  value={values.subject}
                  onChange={onChange}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-primary focus:outline-none"
                  placeholder="Idea, bug, suggestion…"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Your message</label>
                <textarea
                  name="message"
                  value={values.message}
                  onChange={onChange}
                  className="w-full min-h-[100px] rounded-md border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-primary focus:outline-none"
                  placeholder="What would you improve or what didn’t work?"
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
                  {isSubmitting ? 'Sending…' : 'Send feedback'}
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


