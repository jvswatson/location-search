const intFormat = new Intl.NumberFormat('en-US');
const milesFormat = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

export const formatInt = (n: number): string => intFormat.format(n);
export const formatMiles = (n: number): string => milesFormat.format(n);
