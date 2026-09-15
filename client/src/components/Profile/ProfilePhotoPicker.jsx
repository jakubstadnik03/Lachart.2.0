import React, { useRef, useState } from 'react';
import { updateUserProfile } from '../../services/api';
import { defaultAvatarFor, onAvatarError } from '../../utils/avatarUtils';

/**
 * The athlete's own photo, from a file.
 *
 * Garmin's API carries no profile picture — only Strava's does — so an athlete
 * who syncs from a watch had no way to a face in the corner but the generated
 * initials. The file is squared, shrunk to 256 px and stored as a data URL,
 * the way the coach logo is; that keeps it under the profile document's
 * limit and off any CDN that could 403 later.
 */
const SIZE = 256;

export default function ProfilePhotoPicker({ user, isMobile = false, onSaved, onError }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const hasPhoto = !!user?.avatar;

  const save = async (avatar) => {
    setBusy(true);
    try {
      const res = await updateUserProfile({ avatar });
      const updated = res?.data?.user || res?.data;
      onSaved?.(avatar, updated);
    } catch (e) {
      onError?.(e?.response?.data?.error || e?.message || 'Could not save the photo.');
    } finally {
      setBusy(false);
    }
  };

  const onFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!/^image\//.test(file.type)) { onError?.('That file is not an image.'); return; }
    if (file.size > 10 * 1024 * 1024) { onError?.('The photo is over 10 MB — pick a smaller one.'); return; }
    const reader = new FileReader();
    reader.onerror = () => onError?.('Could not read that file.');
    reader.onload = (ev) => {
      const img = new Image();
      img.onerror = () => onError?.('That is not a valid image.');
      img.onload = () => {
        const iw = img.naturalWidth || img.width;
        const ih = img.naturalHeight || img.height;
        if (!iw || !ih) { onError?.('The image has no dimensions.'); return; }
        // Centre-square crop, then shrink.
        const side = Math.min(iw, ih);
        const sx = (iw - side) / 2;
        const sy = (ih - side) / 2;
        const canvas = document.createElement('canvas');
        canvas.width = SIZE;
        canvas.height = SIZE;
        canvas.getContext('2d').drawImage(img, sx, sy, side, side, 0, 0, SIZE, SIZE);
        save(canvas.toDataURL('image/jpeg', 0.86));
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  };

  const px = isMobile ? 44 : 64;
  return (
    <div className="flex items-center gap-3">
      <img
        src={user?.avatar || defaultAvatarFor(user)}
        alt=""
        onError={onAvatarError(user)}
        style={{ width: px, height: px }}
        className="rounded-full object-cover ring-1 ring-gray-200 bg-gray-50 shrink-0"
      />
      <div className="flex flex-wrap items-center gap-1.5">
        <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={onFile} />
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className={`${isMobile ? 'px-2 py-1 text-[10px]' : 'px-3 py-1.5 text-xs'} rounded-lg bg-primary text-white font-semibold hover:opacity-90 disabled:opacity-50`}
        >
          {busy ? 'Saving…' : hasPhoto ? 'Change photo' : 'Upload photo'}
        </button>
        {hasPhoto && (
          <button
            type="button"
            disabled={busy}
            onClick={() => save('')}
            className={`${isMobile ? 'px-2 py-1 text-[10px]' : 'px-3 py-1.5 text-xs'} rounded-lg bg-gray-100 text-gray-700 font-semibold hover:bg-gray-200 disabled:opacity-50`}
          >
            Remove
          </button>
        )}
      </div>
    </div>
  );
}
