/**
 * The way into "What you can do" from anywhere in the app.
 *
 * A guide reachable only from a menu is a guide for people who already went
 * looking; the point of this one is the athlete who does not know there is
 * anything to look for.
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { LightBulbIcon } from '@heroicons/react/24/outline';

export default function FeatureGuideButton() {
  const navigate = useNavigate();

  return (
    <button
      type="button"
      onClick={() => navigate('/guide')}
      aria-label="What you can do in LaChart"
      title="What you can do"
      className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-gray-500 hover:text-primary hover:bg-gray-100 active:bg-gray-200 touch-manipulation transition-colors"
    >
      <LightBulbIcon className="h-6 w-6" />
    </button>
  );
}
