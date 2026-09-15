import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import { XMarkIcon, BookmarkIcon } from '@heroicons/react/24/outline';

/**
 * Saving a session as a template used to be a browser prompt for the name;
 * the category came silently from the plan and the description with it,
 * whether or not that was wanted. This asks for the three things a template
 * is filed by — name, category, description — with the plan's values ready.
 */
export default function SaveTemplateDialog({
  initialName = '', initialCategory = '', initialDescription = '',
  categories = [], saving = false, onSave, onClose,
}) {
  const [name, setName] = useState(initialName);
  const [category, setCategory] = useState(initialCategory || '');
  const [description, setDescription] = useState(initialDescription || '');

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = (e) => {
    e?.preventDefault?.();
    if (!name.trim() || saving) return;
    onSave?.({ name: name.trim(), category: category || '', description: description.trim() });
  };

  const field = 'w-full text-sm px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-800 outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/20';
  return ReactDOM.createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center bg-slate-900/40 p-4"
      // Above the plan modal it opens from (that one sits at 99998).
      style={{ pointerEvents: 'auto', zIndex: 99999 }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Save as template"
    >
      <form
        className="w-full max-w-sm rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200"
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <div className="flex items-center gap-2 px-4 pt-4 pb-3 border-b border-slate-100">
          <BookmarkIcon className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-bold text-slate-900 flex-1">Save as template</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100">
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>
        <div className="px-4 py-3 space-y-3">
          <label className="block">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1">Name</span>
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. 5×8 threshold" className={field} />
          </label>
          <label className="block">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1">Category</span>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className={field}>
              <option value="">No category</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1">Description</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="What the session is for, how it should feel…"
              className={`${field} resize-y`}
            />
            <span className="block text-[10px] text-slate-400 mt-1">Kept with the template and filled in whenever it is planned.</span>
          </label>
        </div>
        <div className="px-4 pb-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
          <button type="submit" disabled={!name.trim() || saving} className="px-3 py-2 rounded-xl bg-primary text-white text-xs font-semibold hover:opacity-90 disabled:opacity-40">
            {saving ? 'Saving…' : 'Save template'}
          </button>
        </div>
      </form>
    </div>,
    document.getElementById('app-modal-root') || document.body,
  );
}
