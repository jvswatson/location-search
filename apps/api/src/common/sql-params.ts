/**
 * Collects positional parameters while SQL is composed from fragments: `params.add(value)` returns
 * the `$n` placeholder to splice in. Values never enter the SQL text.
 */
export class SqlParams {
  readonly values: unknown[] = [];

  add(value: unknown): string {
    this.values.push(value);
    return `$${this.values.length}`;
  }
}
