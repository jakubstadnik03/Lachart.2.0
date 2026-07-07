/**
 * Normalize legacy Czech notification copy to English on read.
 * Older weekly digest pushes used "Týdenní souhrn" / "Tento týden: …".
 */
function normalizeNotificationCopy(doc) {
  if (!doc || typeof doc !== 'object') return doc;

  let title = doc.title;
  let body = doc.body;

  if (doc.type === 'weekly_digest' || String(title || '').includes('Týdenní souhrn')) {
    if (title === 'Týdenní souhrn') title = 'Weekly summary';
    if (typeof body === 'string') {
      body = body
        .replace(/^Tento týden:/i, 'This week:')
        .replace(/,\s*1× přetrénování/i, ', 1× overreaching')
        .replace(/,\s*1× overreaching/i, ', 1× overreaching');
    }
  }

  if (title === doc.title && body === doc.body) return doc;
  return { ...doc, title, body };
}

module.exports = { normalizeNotificationCopy };
