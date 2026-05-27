import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

// ─── Built-in default categories ───────────────────────────────────────────────
//
// `skipFromTitle`: when true, the auto-classifier will NOT propose this
// category just because a title keyword matched (e.g. user explicitly
// types "VO2 test" on a workout that isn't actually VO2max). Defaults to
// false — title detection is on for every category unless the user opts
// out per-category in Settings → Categories.
export const DEFAULT_CATEGORIES = [
  { id: 'endurance', label: 'Endurance', color: '#3b82f6', builtIn: true, skipFromTitle: false },
  { id: 'lt1',       label: 'LT1',       color: '#0ea5e9', builtIn: true, skipFromTitle: false },
  { id: 'tempo',     label: 'Tempo',     color: '#f97316', builtIn: true, skipFromTitle: false },
  { id: 'lt2',       label: 'LT2',       color: '#8b5cf6', builtIn: true, skipFromTitle: false },
  { id: 'zone2',     label: 'Zone 2',    color: '#22c55e', builtIn: true, skipFromTitle: false },
  { id: 'vo2max',    label: 'VO₂max',    color: '#ef4444', builtIn: true, skipFromTitle: false },
  { id: 'hills',     label: 'Hills',     color: '#f59e0b', builtIn: true, skipFromTitle: false },
];

/** Preset color palette for the color picker (matches LacTrace-style grid). */
export const PRESET_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#84cc16', '#22c55e', '#14b8a6',
  '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7',
  '#ec4899', '#f43f5e', '#be123c', '#fb923c', '#78716c', '#6b7280',
];

const STORAGE_KEY = 'lachart:categories';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Convert a hex color to rgba string with given alpha (0–1). */
export function hexToRgba(hex, alpha = 1) {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Returns inline style object for a category tag/badge.
 * Works for both built-in and custom categories.
 */
export function getCategoryStyle(categoryId, allCategories) {
  const cat = allCategories?.find(c => c.id === categoryId);
  if (!cat) {
    return {
      backgroundColor: '#f3f4f6',
      color: '#6b7280',
      borderColor: '#d1d5db',
    };
  }
  return {
    backgroundColor: hexToRgba(cat.color, 0.15),
    color: cat.color,
    borderColor: hexToRgba(cat.color, 0.35),
  };
}

// ─── Context ──────────────────────────────────────────────────────────────────

const CategoryContext = createContext(null);

export function CategoryProvider({ children }) {
  const [categories, setCategories] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Merge: always include built-ins that aren't overridden, then custom
          const builtInIds = new Set(DEFAULT_CATEGORIES.map(c => c.id));
          const customOnly = parsed.filter(c => !builtInIds.has(c.id));
          const builtInsFromStorage = parsed.filter(c => builtInIds.has(c.id));
          // Use stored version of built-ins (allows label/color override), fill in any missing ones
          const mergedBuiltIns = DEFAULT_CATEGORIES.map(def => {
            const stored = builtInsFromStorage.find(s => s.id === def.id);
            return stored ? { ...def, ...stored } : def;
          });
          return [...mergedBuiltIns, ...customOnly];
        }
      }
    } catch {
      // ignore
    }
    return DEFAULT_CATEGORIES;
  });

  // Persist on every change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(categories));
    } catch {
      // ignore
    }
  }, [categories]);

  /** Add a new custom category. Returns false if id already exists. */
  const addCategory = useCallback((label, color) => {
    const id = label.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    if (!id) return false;
    setCategories(prev => {
      if (prev.some(c => c.id === id)) return prev;
      return [...prev, { id, label: label.trim(), color, builtIn: false }];
    });
    return true;
  }, []);

  /** Update label or color of any category. */
  const updateCategory = useCallback((id, patch) => {
    setCategories(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c));
  }, []);

  /** Delete a category. Built-in categories are reset to defaults instead of deleted. */
  const deleteCategory = useCallback((id) => {
    const def = DEFAULT_CATEGORIES.find(c => c.id === id);
    if (def) {
      // Reset to default color/label
      setCategories(prev => prev.map(c => c.id === id ? { ...def } : c));
    } else {
      setCategories(prev => prev.filter(c => c.id !== id));
    }
  }, []);

  /** Get a category by id. */
  const getCategory = useCallback((id) => {
    return categories.find(c => c.id === id) || null;
  }, [categories]);

  /**
   * IDs of categories the user has marked "skip from title" — sent to the
   * server with classify / backfill requests so title-keyword matches for
   * these categories are ignored. Memoised so consumers can pass it to
   * api calls without re-renders triggering refetch.
   */
  const skipFromTitleIds = React.useMemo(
    () => categories.filter(c => c.skipFromTitle === true).map(c => c.id),
    [categories],
  );

  /** Get style object for a category tag. */
  const getCatStyle = useCallback((id) => {
    return getCategoryStyle(id, categories);
  }, [categories]);

  return (
    <CategoryContext.Provider value={{
      categories,
      addCategory,
      updateCategory,
      deleteCategory,
      getCategory,
      getCategoryStyle: getCatStyle,
      skipFromTitleIds,
    }}>
      {children}
    </CategoryContext.Provider>
  );
}

export function useCategories() {
  const ctx = useContext(CategoryContext);
  if (!ctx) throw new Error('useCategories must be used within CategoryProvider');
  return ctx;
}
