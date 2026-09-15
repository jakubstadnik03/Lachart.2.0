import React from 'react';
import { NavLink } from 'react-router-dom';
import { ArrowRightOnRectangleIcon, CalculatorIcon, UserPlusIcon } from '@heroicons/react/24/outline';
import { PUBLIC_LINKS, PUBLIC_TOOLS, ZONE2_TOOL } from '../constants/publicTools';
import { isCapacitorNative } from '../utils/isNativeApp';

/**
 * The sidebar a visitor sees on the free calculators.
 *
 * It used to be the signed-in sidebar wearing a costume: a "Demo User" with
 * a fake e-mail, five of the eight tools under four different icon files,
 * and a greyed-out "Log out" for someone who was never logged in. This is
 * the sidebar for who is actually there — a visitor with no account — and
 * says so: the tools, the reading, and the two doors in.
 */

const ITEM = 'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors touch-manipulation';
const IDLE = 'text-slate-700 hover:bg-slate-100';
const ACTIVE = 'bg-primary text-white';

function GroupLabel({ children }) {
  return <div className="mb-1.5 mt-4 px-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 first:mt-0">{children}</div>;
}

function Item({ to, Icon, children, onClick, external = false, badge = null }) {
  const inner = (
    <>
      <Icon className="h-5 w-5 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {badge && (
        <span className="rounded-full bg-pink-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">{badge}</span>
      )}
    </>
  );
  if (external) {
    return (
      <a href={to} target="_blank" rel="noopener noreferrer" onClick={onClick} className={`${ITEM} ${IDLE}`}>
        {inner}
      </a>
    );
  }
  return (
    <NavLink to={to} onClick={onClick} className={({ isActive }) => `${ITEM} ${isActive ? ACTIVE : IDLE}`}>
      {inner}
    </NavLink>
  );
}

/** Where the signed-in sidebar shows the user: who this is for instead. */
export function GuestIntro() {
  return (
    <div className="flex items-center gap-3 border-b border-slate-200 p-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <CalculatorIcon className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-800">Free tools</p>
        <p className="text-xs text-slate-500">No account needed</p>
      </div>
    </div>
  );
}

export function GuestMenuList({ onItemClick }) {
  const web = !isCapacitorNative();
  return (
    <nav aria-label="Free tools">
      <GroupLabel>Calculators</GroupLabel>
      <ul className="space-y-0.5">
        {PUBLIC_TOOLS.map((t) => (
          <li key={t.id}><Item to={t.path} Icon={t.Icon} onClick={onItemClick}>{t.menu}</Item></li>
        ))}
        <li><Item to={ZONE2_TOOL.path} Icon={ZONE2_TOOL.Icon} onClick={onItemClick}>{ZONE2_TOOL.menu}</Item></li>
      </ul>
      <GroupLabel>Learn</GroupLabel>
      <ul className="space-y-0.5 pb-2">
        <li><Item to={PUBLIC_LINKS.guide.path} Icon={PUBLIC_LINKS.guide.Icon} onClick={onItemClick}>{PUBLIC_LINKS.guide.menu}</Item></li>
        {web && (
          <li><Item to={PUBLIC_LINKS.about.path} Icon={PUBLIC_LINKS.about.Icon} onClick={onItemClick}>{PUBLIC_LINKS.about.menu}</Item></li>
        )}
        {web && (
          <li>
            <Item
              to={PUBLIC_LINKS.app.path}
              Icon={PUBLIC_LINKS.app.Icon}
              external
              badge={PUBLIC_LINKS.app.badge}
              onClick={() => {
                onItemClick?.();
                try { window.gtag && window.gtag('event', 'menu_download_app_click'); } catch { /* no analytics */ }
              }}
            >
              {PUBLIC_LINKS.app.menu}
            </Item>
          </li>
        )}
      </ul>
    </nav>
  );
}

/** The two doors in, where the signed-in sidebar has Settings and Log out. */
export function GuestMenuFooter({ onItemClick }) {
  return (
    <div className="space-y-2 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] sm:p-4">
      <NavLink
        to="/signup"
        onClick={onItemClick}
        className="flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-primary to-pink-500 px-3 text-sm font-semibold text-white shadow-sm transition hover:shadow-md touch-manipulation"
      >
        <UserPlusIcon className="h-5 w-5" />
        Sign up for free
      </NavLink>
      <NavLink
        to="/login"
        onClick={onItemClick}
        className="flex min-h-[44px] items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-50 touch-manipulation"
      >
        <ArrowRightOnRectangleIcon className="h-5 w-5" />
        Sign in
      </NavLink>
      <p className="pt-1 text-center text-[11px] text-slate-400">© 2026 LaChart</p>
    </div>
  );
}
