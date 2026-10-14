/** Tokens kept uppercase: military/aviation designators and country abbreviations in GADB. */
const ACRONYMS = new Set([
  'AAF', // Army Airfield
  'AB', // Air Base
  'AFB', // Air Force Base
  'ANG', // Air National Guard
  'ARB', // Air Reserve Base
  'JRB', // Joint Reserve Base
  'LRRS', // Long Range Radar Site
  'MCAF', // Marine Corps Air Facility
  'MCAS', // Marine Corps Air Station
  'NAF', // Naval Air Facility
  'NAS', // Naval Air Station
  'NS', // Naval Station
  'NSF', // Naval Support Facility
  'PMRF', // Pacific Missile Range Facility
  'RAF',
  'RAAF',
  'RCAF',
  'RNAS',
  'TSTC',
  'UAE',
  'UK',
  'USA',
  'USAF',
  'USN',
  'II',
  'III',
  'IV',
]);

/** Connecting words lowercased anywhere but the first word ("Charles de Gaulle"). */
const MINOR_WORDS = new Set([
  'of',
  'and',
  'the',
  'de',
  'del',
  'della',
  'da',
  'das',
  'do',
  'dos',
  'du',
  'des',
  'la',
  'le',
  'les',
  'am',
  'im',
  'der',
  'en',
  'sur',
  'na',
  'on',
  'upon',
]);

// Separators are kept so the original punctuation and spacing survive.
const SEPARATOR = /(\s+|[-/()])/;

/**
 * Title-cases an UPPERCASE GADB value: "CHARLES DE GAULLE" → "Charles de Gaulle",
 * "N'DJAMENA" → "N'Djamena", "MCALLEN MILLER INTERNATIONAL" → "McAllen Miller International".
 */
export function titleCase(input: string): string {
  let wordIndex = 0;
  return input
    .split(SEPARATOR)
    .map((part) => {
      if (part === '' || SEPARATOR.test(part)) return part;
      const isFirst = wordIndex++ === 0;
      return caseWord(part, isFirst);
    })
    .join('');
}

function caseWord(word: string, isFirst: boolean): string {
  const upper = word.toUpperCase();
  if (ACRONYMS.has(upper) || /\d/.test(word)) return upper;

  const lower = word.toLowerCase();
  if (!isFirst && MINOR_WORDS.has(lower)) return lower;

  // "mcallen" → "McAllen" (but a bare "MC" is just "Mc").
  if (/^mc[a-z]{2,}/.test(lower)) return 'Mc' + capitalize(lower.slice(2));

  // Single-letter elision prefix: "n'djamena" → "N'Djamena", "d'or" → "D'Or". Longer prefixes are
  // possessives or transliterations and keep a lowercase tail: "John's", "Xi'an", "Vava'u".
  if (/^[a-z]'[a-z]/.test(lower)) return lower[0]!.toUpperCase() + "'" + capitalize(lower.slice(2));

  // Capitalize after dots too: "st.vincent" → "St.Vincent", "a.f.b." → "A.F.B.".
  return lower.replace(/(^|\.)([a-z])/g, (_m, dot: string, ch: string) => dot + ch.toUpperCase());
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
