/** Client-side fallback for legacy Czech weekly digest notifications. */
export function normalizeNotificationCopy(n) {
  if (!n) return n;
  let title = n.title;
  let body = n.body;

  if (n.type === 'weekly_digest' || title === 'Týdenní souhrn') {
    if (title === 'Týdenní souhrn') title = 'Weekly summary';
    if (typeof body === 'string') {
      body = body.replace(/^Tento týden:/i, 'This week:');
    }
  }

  if (title === n.title && body === n.body) return n;
  return { ...n, title, body };
}
