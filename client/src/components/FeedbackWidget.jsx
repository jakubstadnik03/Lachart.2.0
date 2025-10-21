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
      const payload = {
        subject: values.subject || 'Feedback',
        message: values.message,
        email: values.email || undefined,
        page: window.location.pathname
      };
      
      console.log('Submitting feedback:', payload);
      
      const res = await submitFeedback(payload);
      console.log('Feedback response:', res);
      
      addNotification('Thanks for your feedback!', 'success');
      setValues({ subject: '', message: '', email: '' });
      setOpen(false);
    } catch (err) {
      console.error('Feedback submit error:', err);
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
        const emailSubject = encodeURIComponent(`[LaChart Feedback] ${values.subject || 'Feedback'}`);
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


