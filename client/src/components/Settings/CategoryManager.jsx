import React, { useState } from 'react';
import { useCategories, PRESET_COLORS, hexToRgba } from '../../context/CategoryContext';
import { PlusIcon, TrashIcon, PencilIcon, CheckIcon, XMarkIcon } from '@heroicons/react/24/outline';

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
        <div className="flex items-center gap-3">
          <span
            className="rounded-full border px-2.5 py-0.5 text-xs font-semibold"
            style={tagStyle}
          >
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
