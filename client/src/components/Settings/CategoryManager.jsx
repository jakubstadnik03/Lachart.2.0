import React, { useState } from 'react';
import { useCategories, PRESET_COLORS, hexToRgba } from '../../context/CategoryContext';
import { PlusIcon, TrashIcon, PencilIcon, CheckIcon, XMarkIcon } from '@heroicons/react/24/outline';

// ── Category icon SVGs (matching TrainingForm) ────────────────────────────────
const CatSvg = ({ children, size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, display: 'block' }}>
    {children}
  </svg>
);

const CATEGORY_ICONS = {
  endurance: <CatSvg><path d="M2 12 C5.5 6 8.5 6 12 12 C15.5 18 18.5 18 22 12" /></CatSvg>,
  lt1: <CatSvg>
    <polyline points="3,19 9,16 14,10 20,5" />
    <circle cx="14" cy="10" r="2.2" fill="currentColor" stroke="none" />
  </CatSvg>,
  tempo: <CatSvg>
    <circle cx="12" cy="13" r="8" />
    <polyline points="12,9 12,13 15,15" />
    <line x1="9" y1="2" x2="15" y2="2" />
    <line x1="12" y1="2" x2="12" y2="5" />
  </CatSvg>,
  lt2: <CatSvg>
    <polyline points="3,19 7,18 10,15 13,9 19,4" />
    <circle cx="13" cy="9" r="2.2" fill="currentColor" stroke="none" />
  </CatSvg>,
  zone2: <CatSvg strokeWidth="1.8">
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    <polyline points="8,12 10,10 11,14 13,10 14,12" strokeWidth="1.2" />
  </CatSvg>,
  vo2max: <CatSvg>
    <line x1="12" y1="19" x2="12" y2="5" />
    <polyline points="5,12 12,5 19,12" />
    <line x1="8" y1="19" x2="8" y2="16" strokeWidth="1.2" />
    <line x1="12" y1="21" x2="12" y2="19" strokeWidth="1.2" />
    <line x1="16" y1="19" x2="16" y2="16" strokeWidth="1.2" />
  </CatSvg>,
  hills: <CatSvg>
    <polyline points="2,20 7,10 11,15 15,8 19,13 22,20" />
    <line x1="2" y1="20" x2="22" y2="20" />
  </CatSvg>,
};

/** Color picker grid — same style as LacTrace tag creation dialog. */
function ColorPicker({ value, onChange }) {
  return (
    <div className="grid grid-cols-6 gap-2">
      {PRESET_COLORS.map(color => (
        <button
          key={color}
          type="button"
          onClick={() => onChange(color)}
          className="w-8 h-8 rounded-xl transition-transform hover:scale-110 focus:outline-none"
          style={{
            backgroundColor: color,
            boxShadow: value === color ? `0 0 0 3px white, 0 0 0 5px ${color}` : undefined,
            transform: value === color ? 'scale(1.15)' : undefined,
          }}
          title={color}
        />
      ))}
    </div>
  );
}

/** Single category row in the manager list. */
function CategoryRow({ cat, onUpdate, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(cat.label);
  const [color, setColor] = useState(cat.color);
  // Independent of the edit-mode form because users want to toggle this
  // without having to click "Edit" / "Save" — it's a setting, not a name change.
  const skipFromTitle = cat.skipFromTitle === true;

  const handleSave = () => {
    if (!label.trim()) return;
    onUpdate(cat.id, { label: label.trim(), color });
    setEditing(false);
  };

  const handleCancel = () => {
    setLabel(cat.label);
    setColor(cat.color);
    setEditing(false);
  };

  const handleToggleSkipFromTitle = (e) => {
    onUpdate(cat.id, { skipFromTitle: e.target.checked });
  };

  const tagStyle = {
    backgroundColor: hexToRgba(cat.color, 0.15),
    color: cat.color,
    borderColor: hexToRgba(cat.color, 0.35),
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      {editing ? (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={label}
              onChange={e => setLabel(e.target.value)}
              className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-[#767eb5] focus:outline-none focus:ring-1 focus:ring-[#767eb5]"
              placeholder="Category name"
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') handleCancel(); }}
            />
            <button
              onClick={handleSave}
              className="rounded-lg bg-emerald-500 p-1.5 text-white hover:bg-emerald-600 transition-colors"
              title="Save"
            >
              <CheckIcon className="w-4 h-4" />
            </button>
            <button
              onClick={handleCancel}
              className="rounded-lg bg-slate-400 p-1.5 text-white hover:bg-slate-500 transition-colors"
              title="Cancel"
            >
              <XMarkIcon className="w-4 h-4" />
            </button>
          </div>
          <ColorPicker value={color} onChange={setColor} />
          {/* Preview */}
          <div className="flex items-center gap-2 text-xs text-slate-500">
            Preview:
            <span
              className="rounded-full border px-2.5 py-0.5 text-xs font-semibold"
              style={{ backgroundColor: hexToRgba(color, 0.15), color, borderColor: hexToRgba(color, 0.35) }}
            >
              {label || 'Category'}
            </span>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <span
              className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold"
              style={tagStyle}
            >
              {cat.builtIn && CATEGORY_ICONS[cat.id] ? CATEGORY_ICONS[cat.id] : null}
              {cat.label}
            </span>
            {cat.builtIn && (
              <span className="text-[10px] uppercase tracking-wide text-slate-400">built-in</span>
            )}
            <div className="ml-auto flex items-center gap-1.5">
              <button
                onClick={() => setEditing(true)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                title="Edit"
              >
                <PencilIcon className="w-4 h-4" />
              </button>
              <button
                onClick={() => onDelete(cat.id)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                title={cat.builtIn ? 'Reset to default' : 'Delete'}
              >
                <TrashIcon className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Auto-detect opt-out — kept outside the edit form because it's
              a behaviour toggle, not part of the name/color edit cycle. */}
          <label className="flex items-center gap-2 text-xs text-slate-500 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={skipFromTitle}
              onChange={handleToggleSkipFromTitle}
              className="h-3.5 w-3.5 rounded border-slate-300 text-[#767eb5] focus:ring-1 focus:ring-[#767eb5]"
            />
            <span>
              Skip auto-detection from workout name
              <span className="ml-1 text-slate-400">
                (don't assign this category just because the title contains "{cat.label}")
              </span>
            </span>
          </label>
        </div>
      )}
    </div>
  );
}

/** Modal / panel for creating a new category. */
function NewCategoryForm({ onAdd, onClose }) {
  const [label, setLabel] = useState('');
  const [color, setColor] = useState(PRESET_COLORS[4]); // default green
  const [error, setError] = useState('');

  const handleSubmit = () => {
    if (!label.trim()) { setError('Name is required'); return; }
    const ok = onAdd(label, color);
    if (!ok) { setError('A category with this name already exists'); return; }
    onClose();
  };

  return (
    <div className="rounded-xl border border-[#767eb5]/30 bg-[#eef2ff]/50 p-4 space-y-4">
      <h4 className="text-sm font-bold text-slate-900">Create new category</h4>
      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1 uppercase tracking-wide">Name *</label>
        <input
          type="text"
          value={label}
          onChange={e => { setLabel(e.target.value); setError(''); }}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-[#767eb5] focus:outline-none focus:ring-1 focus:ring-[#767eb5]"
          placeholder="e.g., Long Run, Sweet Spot, Race Prep"
          autoFocus
          onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); if (e.key === 'Escape') onClose(); }}
        />
        {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-500 mb-2 uppercase tracking-wide">Color</label>
        <ColorPicker value={color} onChange={setColor} />
      </div>
      {/* Preview */}
      <div className="flex items-center gap-2 text-xs text-slate-500">
        Preview:
        <span
          className="rounded-full border px-2.5 py-0.5 text-xs font-semibold"
          style={{ backgroundColor: hexToRgba(color, 0.15), color, borderColor: hexToRgba(color, 0.35) }}
        >
          {label || 'New Category'}
        </span>
      </div>
      <div className="flex gap-2 justify-end pt-1">
        <button
          onClick={onClose}
          className="rounded-lg border border-slate-200 px-4 py-1.5 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          className="rounded-lg bg-[#767eb5] px-4 py-1.5 text-sm font-semibold text-white hover:bg-[#5e6699] transition-colors"
        >
          Create
        </button>
      </div>
    </div>
  );
}

/**
 * CategoryManager — drop-in panel for Settings or as a standalone modal.
 * Shows all categories, allows editing colors/labels and adding custom ones.
 */
export default function CategoryManager() {
  const { categories, addCategory, updateCategory, deleteCategory } = useCategories();
  const [showNewForm, setShowNewForm] = useState(false);

  const builtIn = categories.filter(c => c.builtIn);
  const custom = categories.filter(c => !c.builtIn);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-slate-900">Training Categories</h3>
          <p className="text-sm text-slate-500 mt-0.5">
            Organise activities with color-coded categories. Used in Training Log, Calendar, and filters.
          </p>
        </div>
        {!showNewForm && (
          <button
            onClick={() => setShowNewForm(true)}
            className="flex items-center gap-1.5 rounded-xl bg-[#767eb5] px-3 py-2 text-sm font-semibold text-white hover:bg-[#5e6699] transition-colors shadow-sm"
          >
            <PlusIcon className="w-4 h-4" />
            New category
          </button>
        )}
      </div>

      {showNewForm && (
        <NewCategoryForm
          onAdd={addCategory}
          onClose={() => setShowNewForm(false)}
        />
      )}

      <div className="space-y-3">
        <p className="text-xs uppercase tracking-wider font-semibold text-slate-400">Built-in</p>
        {builtIn.map(cat => (
          <CategoryRow
            key={cat.id}
            cat={cat}
            onUpdate={updateCategory}
            onDelete={deleteCategory}
          />
        ))}
      </div>

      {custom.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs uppercase tracking-wider font-semibold text-slate-400">Custom</p>
          {custom.map(cat => (
            <CategoryRow
              key={cat.id}
              cat={cat}
              onUpdate={updateCategory}
              onDelete={deleteCategory}
            />
          ))}
        </div>
      )}
    </div>
  );
}
