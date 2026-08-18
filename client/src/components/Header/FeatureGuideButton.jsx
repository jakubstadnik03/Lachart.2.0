/**
 * The way into "What you can do" from anywhere in the app.
 *
 * A guide reachable only from a menu is a guide for people who already went
 * looking; the point of this one is the athlete who does not know there is
 * anything to look for.
 */
import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { LightBulbIcon } from '@heroicons/react/24/outline';
import { LightBulbIcon as LightBulbSolid } from '@heroicons/react/24/solid';

export default function FeatureGuideButton() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  // Lit while you are on the page it opens, so the header says where you are.
  const active = pathname === '/guide';
  const Icon = active ? LightBulbSolid : LightBulbIcon;

  return (
    <button
      type="button"
      onClick={() => navigate('/guide')}
      aria-label="What you can do in LaChart"
      aria-current={active ? 'page' : undefined}
      title="What you can do"
      className={`min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg touch-manipulation transition-colors ${
        active
          ? 'text-primary bg-primary/10'
          : 'text-gray-500 hover:text-primary hover:bg-gray-100 active:bg-gray-200'
      }`}
    >
      <Icon className="h-6 w-6" />
    </button>
  );
}
