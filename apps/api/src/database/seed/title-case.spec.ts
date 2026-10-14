import { titleCase } from './title-case.js';

describe('titleCase', () => {
  it.each([
    ['HEATHROW', 'Heathrow'],
    ['JOHN F KENNEDY INTERNATIONAL', 'John F Kennedy International'],
    ['CHARLES DE GAULLE', 'Charles de Gaulle'],
    ['DE KOOY', 'De Kooy'], // a minor word is still capitalized when it comes first
    ['NIKOLAEVSK-NA-AMURE', 'Nikolaevsk-na-Amure'],
    ['BOSNIA-HERCEGOVINA', 'Bosnia-Hercegovina'],
    ['ST.VINCENT/GRENADINES', 'St.Vincent/Grenadines'],
    ['ST. KITTS & NEVIS', 'St. Kitts & Nevis'],
    ['GALAPAGOS I. (ECUADOR', 'Galapagos I. (Ecuador'],
    ['ELLSWORTH AFB', 'Ellsworth AFB'],
    ['WHEELER AAF', 'Wheeler AAF'],
    ['USA', 'USA'],
    ['UK', 'UK'],
    ['LAKE GENEVA 59E', 'Lake Geneva 59E'],
    ['FORT SMITH RGNL', 'Fort Smith Rgnl'],
    ['MCALLEN MILLER INTERNATIONAL', 'McAllen Miller International'],
    ['MC CLELLAN', 'Mc Clellan'],
    ['MCAS MIRAMAR', 'MCAS Miramar'],
    ["N'DJAMENA", "N'Djamena"],
    ["L'ORNE", "L'Orne"],
    ["D'OR", "D'Or"],
    ["LAND'S END", "Land's End"],
    ["ST. JOHN'S", "St. John's"],
    ["XI'AN", "Xi'an"],
    ["VAVA'U", "Vava'u"],
    ['A.F.B.', 'A.F.B.'],
    ['SAN JUAN DE LA MAGUANA', 'San Juan de la Maguana'],
    ['ISLE OF MAN', 'Isle of Man'],
    ['JOHN PAUL II', 'John Paul II'],
  ])('%s → %s', (input, expected) => {
    expect(titleCase(input)).toBe(expected);
  });

  it('preserves spacing and punctuation', () => {
    expect(titleCase('  A  B ')).toBe('  A  B ');
  });

  it('returns an empty string unchanged', () => {
    expect(titleCase('')).toBe('');
  });
});
