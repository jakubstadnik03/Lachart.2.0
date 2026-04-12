import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../../services/api';

const MAX_CHARS = 2000;

function formatTimestamp(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function RolePill({ role }) {
  const colors = {
    coach: 'bg-[#767EB5] text-white',
    athlete: 'bg-emerald-100 text-emerald-700',
    tester: 'bg-amber-100 text-amber-700',
    testing: 'bg-amber-100 text-amber-700',
  };
  const label = role.charAt(0).toUpperCase() + role.slice(1);
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${colors[role] || 'bg-gray-100 text-gray-600'}`}>
      {label}
    </span>
  );
}

function CommentSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      {[1, 2].map((i) => (
        <div key={i} className="flex gap-3">
          <div className="w-8 h-8 rounded-full bg-gray-200 flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-3 bg-gray-200 rounded w-1/3" />
            <div className="h-4 bg-gray-200 rounded w-full" />
            <div className="h-4 bg-gray-200 rounded w-3/4" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function TestComments({ testId, currentUser }) {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [text, setText] = useState('');
  const [posting, setPosting] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const isCoach = ['coach', 'tester', 'testing'].includes(currentUser?.role);

  const fetchComments = useCallback(async () => {
    if (!testId) return;
    try {
      const res = await api.get(`/api/comments/test/${testId}`);
      setComments(res.data || []);
      setError(null);
    } catch (err) {
      setError('Failed to load comments.');
    } finally {
      setLoading(false);
    }
  }, [testId]);

  // Initial fetch
  useEffect(() => {
    setLoading(true);
    fetchComments();
  }, [fetchComments]);

  // Poll every 30 seconds
  useEffect(() => {
    const interval = setInterval(fetchComments, 30000);
    return () => clearInterval(interval);
  }, [fetchComments]);

  const handlePost = async () => {
    if (!text.trim() || posting) return;
    setPosting(true);
    try {
      const res = await api.post(`/api/comments/test/${testId}`, { text: text.trim() });
      setComments((prev) => [...prev, res.data]);
      setText('');
    } catch {
      setError('Failed to post comment.');
    } finally {
      setPosting(false);
    }
  };

  const handleDelete = async (commentId) => {
    setDeletingId(commentId);
    try {
      await api.delete(`/api/comments/${commentId}`);
      setComments((prev) => prev.filter((c) => c._id !== commentId));
    } catch {
      setError('Failed to delete comment.');
    } finally {
      setDeletingId(null);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      handlePost();
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5"
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xl">💬</span>
        <h3 className="text-lg font-semibold text-gray-800">Coach Notes</h3>
        {comments.length > 0 && (
          <span className="ml-auto text-xs text-gray-400">{comments.length} note{comments.length !== 1 ? 's' : ''}</span>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="mb-3 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>
      )}

      {/* Comments list */}
      <div className="space-y-3 mb-4 max-h-80 overflow-y-auto pr-1">
        {loading ? (
          <CommentSkeleton />
        ) : comments.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-6"
          >
            {isCoach ? (
              <p className="text-gray-400 text-sm">No notes yet. Add the first note below.</p>
            ) : (
              <p className="text-gray-400 text-sm">Your coach hasn't added any notes yet.</p>
            )}
          </motion.div>
        ) : (
          <AnimatePresence initial={false}>
            {comments.map((comment) => {
              const isOwn = comment.author?._id === currentUser?._id || comment.authorId === currentUser?._id;
              return (
                <motion.div
                  key={comment._id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -8 }}
                  transition={{ duration: 0.25 }}
                  className="flex gap-3 group"
                >
                  {/* Avatar initial */}
                  <div className="w-8 h-8 rounded-full bg-[#767EB5] text-white flex items-center justify-center text-sm font-bold flex-shrink-0 mt-0.5">
                    {(comment.author?.name || comment.authorName || '?')[0].toUpperCase()}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-gray-800">
                        {comment.author?.name
                          ? `${comment.author.name} ${comment.author.surname || ''}`.trim()
                          : comment.authorName || 'Unknown'}
                      </span>
                      <RolePill role={comment.author?.role || comment.authorRole || 'coach'} />
                      <span className="text-xs text-gray-400 ml-auto whitespace-nowrap">
                        {formatTimestamp(comment.createdAt)}
                      </span>
                    </div>
                    <div className="bg-gray-50 rounded-xl px-3 py-2 text-sm text-gray-700 leading-relaxed relative">
                      {comment.text}
                      {isOwn && (
                        <button
                          onClick={() => handleDelete(comment._id)}
                          disabled={deletingId === comment._id}
                          className="absolute -top-2 -right-2 w-5 h-5 bg-red-100 text-red-500 rounded-full text-xs items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hidden group-hover:flex hover:bg-red-200"
                          title="Delete comment"
                        >
                          {deletingId === comment._id ? '…' : '×'}
                        </button>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>

      {/* Input area — coaches only */}
      {isCoach && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="border-t border-gray-100 pt-4"
        >
          <div className="relative">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, MAX_CHARS))}
              onKeyDown={handleKeyDown}
              placeholder="Write a note for your athlete… (Ctrl+Enter to submit)"
              rows={3}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-700 resize-none focus:outline-none focus:ring-2 focus:ring-[#767EB5] focus:border-transparent placeholder-gray-400"
            />
            <span className={`absolute bottom-2 right-3 text-xs ${text.length >= MAX_CHARS ? 'text-red-500' : 'text-gray-400'}`}>
              {text.length}/{MAX_CHARS}
            </span>
          </div>
          <div className="flex justify-end mt-2">
            <button
              onClick={handlePost}
              disabled={!text.trim() || posting}
              className="bg-[#767EB5] hover:bg-[#5a6299] disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              {posting ? 'Adding…' : 'Add Note'}
            </button>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}
