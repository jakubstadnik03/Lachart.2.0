import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthProvider';
import { getTrainingComments, addTrainingComment, deleteTrainingComment } from '../services/api';

export default function TrainingComments({ trainingId, trainingType = 'training', isMobile = false }) {
  const { user } = useAuth();
  const [comments, setComments] = useState([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [activeCommentId, setActiveCommentId] = useState(null); // for mobile tap-to-show-delete
  const bottomRef = useRef(null);

  useEffect(() => {
    if (!trainingId) return;
    setLoading(true);
    getTrainingComments(trainingId)
      .then(r => setComments(r.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [trainingId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!text.trim() || submitting) return;
    setSubmitting(true);
    try {
      const r = await addTrainingComment(trainingId, text.trim(), trainingType);
      setComments(prev => [...prev, r.data]);
      setText('');
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    } catch (err) {
      console.error('Failed to post comment', err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (commentId) => {
    try {
      await deleteTrainingComment(commentId);
      setComments(prev => prev.filter(c => c._id !== commentId));
    } catch {}
  };

  const fmtTime = (d) => {
    const date = new Date(d);
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ' ' +
      date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  };

  const canDelete = (comment) => {
    if (!user) return false;
    return String(comment.authorId) === String(user._id) || user.role === 'coach' || user.role === 'admin';
  };

  return (
    <div className={`${isMobile ? 'border-t border-gray-100 pt-4' : 'rounded-2xl border border-gray-200 shadow-sm'}`}>
      {!isMobile && (
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
          <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-3 3v-3z" />
          </svg>
          <h3 className="text-sm font-semibold text-gray-800">Comments</h3>
          {comments.length > 0 && <span className="text-xs text-gray-400">({comments.length})</span>}
        </div>
      )}
      {isMobile && (
        <div className="flex items-center gap-2 mb-3">
          <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-3 3v-3z" />
          </svg>
          <span className="text-sm font-semibold text-gray-800">Comments {comments.length > 0 ? `(${comments.length})` : ''}</span>
        </div>
      )}
      <div className={`${isMobile ? '' : 'px-5 py-4'} space-y-3 max-h-64 overflow-y-auto`}>
        {loading && <p className="text-xs text-gray-400">Loading...</p>}
        {!loading && comments.length === 0 && (
          <p className="text-xs text-gray-400 italic">No comments yet. Be the first to add one.</p>
        )}
        {comments.map(c => {
          const isOwn = String(c.authorId) === String(user?._id);
          const showDelete = canDelete(c) && (activeCommentId === c._id);
          return (
            <div
              key={c._id}
              className={`flex gap-2.5 group ${isOwn ? 'flex-row-reverse' : ''}`}
              onTouchStart={() => canDelete(c) && setActiveCommentId(id => id === c._id ? null : c._id)}
            >
              {(() => {
                const avatarUrl = isOwn ? (user?.avatar || c.authorAvatar) : c.authorAvatar;
                const colorCls = c.authorRole === 'coach' ? 'bg-violet-500' : 'bg-blue-500';
                return avatarUrl
                  ? <img src={avatarUrl} alt={c.authorName} className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
                  : <div className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0 ${colorCls}`}>{(c.authorName || '?')[0].toUpperCase()}</div>;
              })()}
              <div className={`flex-1 min-w-0 flex flex-col gap-0.5 ${isOwn ? 'items-end' : 'items-start'}`}>
                <div className={`flex items-center gap-2 ${isOwn ? 'flex-row-reverse' : ''}`}>
                  <span className="text-[10px] font-semibold text-gray-700">{c.authorName}</span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${c.authorRole === 'coach' ? 'bg-violet-100 text-violet-700' : 'bg-blue-100 text-blue-700'}`}>{c.authorRole}</span>
                  <span className="text-[9px] text-gray-400">{fmtTime(c.createdAt)}</span>
                </div>
                <div className={`relative max-w-[85%] px-3 py-2 rounded-2xl text-xs leading-relaxed ${
                  isOwn ? 'bg-primary text-white rounded-tr-sm' : 'bg-gray-100 text-gray-800 rounded-tl-sm'
                }`}>
                  {c.text}
                  {canDelete(c) && (
                    <button
                      onClick={() => handleDelete(c._id)}
                      className={`absolute -top-1.5 -right-1.5 w-4 h-4 items-center justify-center bg-red-100 text-red-500 rounded-full hover:bg-red-200 transition-colors ${showDelete || !isMobile ? 'flex' : 'hidden group-hover:flex'}`}
                      title="Delete"
                    >
                      <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
      <form onSubmit={handleSubmit} className={`${isMobile ? 'mt-3' : 'px-5 pb-4 mt-2'} flex gap-2`}>
        <input
          type="text"
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Add a comment…"
          className={`flex-1 ${isMobile ? 'text-xs px-3 py-2' : 'text-sm px-3 py-2'} border border-gray-200 rounded-xl bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition`}
          maxLength={2000}
          disabled={submitting}
        />
        <button
          type="submit"
          disabled={!text.trim() || submitting}
          className={`${isMobile ? 'px-3 py-2 text-xs' : 'px-4 py-2 text-sm'} bg-primary text-white rounded-xl font-semibold disabled:opacity-40 hover:bg-primary-dark transition`}
        >
          Send
        </button>
      </form>
    </div>
  );
}
