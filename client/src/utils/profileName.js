/** Split legacy combined `name` when surname was merged into one field. */
export function splitProfileNameFields(data) {
  let name = String(data?.name || '').trim();
  let surname = String(data?.surname || '').trim();
  if (!surname && name.includes(' ')) {
    const i = name.indexOf(' ');
    surname = name.slice(i + 1).trim();
    name = name.slice(0, i).trim();
  }
  return { name, surname };
}

export function formatProfileFullName(data, fallback = 'Athlete') {
  const { name, surname } = splitProfileNameFields(data);
  return [name, surname].filter(Boolean).join(' ') || fallback;
}
