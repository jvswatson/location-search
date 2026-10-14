interface Props {
  value: string;
  onChange: (value: string) => void;
}

export function SearchBar({ value, onChange }: Props) {
  return (
    <input
      type="search"
      aria-label="Search airports"
      placeholder="Search by name, city, ICAO or IATA code"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-sky-500 focus:ring-2 focus:ring-sky-200 focus:outline-none"
    />
  );
}
