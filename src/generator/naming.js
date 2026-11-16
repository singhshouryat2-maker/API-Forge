/**
 * Small naming helpers used by the code generator.
 */

const IRREGULAR = {
  person: 'people',
  child: 'children',
  man: 'men',
  woman: 'women',
  mouse: 'mice',
  goose: 'geese',
  foot: 'feet',
  tooth: 'teeth',
};
const UNCOUNTABLE = new Set(['news', 'data', 'info', 'information', 'equipment', 'media', 'series', 'species', 'feedback', 'metadata']);

const lowerFirst = (s) => s.charAt(0).toLowerCase() + s.slice(1);
const upperFirst = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** UserProfile -> user-profile, user_profile -> user-profile */
function toKebab(s) {
  return s
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .replace(/[_\s]+/g, '-')
    .toLowerCase();
}

/** UserProfile -> User Profile */
function humanize(s) {
  return toKebab(s)
    .split('-')
    .map(upperFirst)
    .join(' ');
}

function pluralizeWord(word) {
  const lower = word.toLowerCase();
  if (UNCOUNTABLE.has(lower)) return word;
  if (IRREGULAR[lower]) {
    const p = IRREGULAR[lower];
    return word[0] === word[0].toUpperCase() ? upperFirst(p) : p;
  }
  if (/[^aeiou]y$/i.test(word)) return word.slice(0, -1) + 'ies';
  if (/(s|x|z|ch|sh)$/i.test(word)) return word + 'es';
  if (/[^aeiou]o$/i.test(word) && !/(photo|piano|video|radio|logo|memo|demo)$/i.test(word)) return word + 'es';
  if (/(?:[^f])fe$/i.test(word)) return word.slice(0, -2) + 'ves';
  if (/[lr]f$/i.test(word)) return word.slice(0, -1) + 'ves';
  return word + 's';
}

/** Pluralizes only the last segment: user-profile -> user-profiles */
function pluralizeKebab(kebab) {
  const parts = kebab.split('-');
  parts[parts.length - 1] = pluralizeWord(parts[parts.length - 1]);
  return parts.join('-');
}

function slugify(s) {
  return (
    String(s || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'generated-api'
  );
}

module.exports = { lowerFirst, upperFirst, toKebab, humanize, pluralizeWord, pluralizeKebab, slugify };
