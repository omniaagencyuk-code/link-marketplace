/**
 * Refuse a migration that the Supabase SQL editor will not run.
 *
 * The server is more permissive than the editor. Postgres accepts
 * `values jsonb` as a column name; the editor parses statements itself,
 * client side, and rejects it - so `verify:rls`, which only ever asks the
 * server, passed a migration that failed the moment it was pasted in.
 *
 * This closes that gap the only way available without the editor's parser:
 * by refusing the reserved words outright. Quoting would satisfy both and is
 * deliberately not accepted here - a column that needs quotes forever is a
 * trap for every query written afterwards.
 */
import fs from 'node:fs';
import path from 'node:path';

/** Reserved in PostgreSQL: cannot be a column name without quoting. */
const RESERVED = new Set([
  'all', 'analyse', 'analyze', 'and', 'any', 'array', 'as', 'asc', 'asymmetric',
  'both', 'case', 'cast', 'check', 'collate', 'column', 'constraint', 'create',
  'current_catalog', 'current_date', 'current_role', 'current_time',
  'current_timestamp', 'current_user', 'default', 'deferrable', 'desc',
  'distinct', 'do', 'else', 'end', 'except', 'false', 'fetch', 'for', 'foreign',
  'from', 'grant', 'group', 'having', 'in', 'initially', 'intersect', 'into',
  'lateral', 'leading', 'limit', 'localtime', 'localtimestamp', 'not', 'null',
  'offset', 'on', 'only', 'or', 'order', 'placing', 'primary', 'references',
  'returning', 'select', 'session_user', 'some', 'symmetric', 'table', 'then',
  'to', 'trailing', 'true', 'union', 'unique', 'user', 'using', 'values',
  'variadic', 'when', 'where', 'window', 'with',
]);

/**
 * SQL types, so that a line only counts as a column definition when it reads
 * "name type". Without this the scan calls `create policy` a column named
 * "create" and `primary key (a, b)` a column named "primary", and a check
 * that cries wolf forty times is one nobody runs twice.
 */
const TYPE = String.raw`(?:uuid|text|jsonb|json|boolean|bool|smallint|integer|int|bigint|numeric|decimal|real|double|date|timestamptz|timestamp|time|char|character|varchar|bytea|inet|interval|serial|bigserial|smallserial|money|[a-z_]+\.[a-z_]+)`;
const COLUMN_LINE = new RegExp(String.raw`^([a-z_][a-z0-9_]*)\s+${TYPE}\b`, 'i');
const ADD_COLUMN = new RegExp(
  String.raw`^\s*add column\s+(?:if not exists\s+)?([a-z_][a-z0-9_]*)\s+${TYPE}\b`,
  'i',
);

/**
 * Already in the database, and staying there.
 *
 * `page_content.values` and `custom_pages.values` shipped long ago and the
 * CMS reads them every request. Renaming a live column to satisfy a linter
 * would mean a data migration and a coordinated deploy to fix nothing that is
 * broken. This check exists to stop the next one, not to relitigate these.
 *
 * Note that these two went through the Supabase SQL editor at the time,
 * which is why the failure in 0019 was a surprise. Whatever changed, the
 * rename is the right answer either way: a column that needs quoting forever
 * is a trap for every query written afterwards.
 */
const ALLOWED = new Set(['0005_cms.sql:values', '0007_custom_pages.sql:values']);

const dir = path.join(process.cwd(), 'supabase/migrations');
const problems = [];

for (const file of fs.readdirSync(dir).filter((name) => name.endsWith('.sql')).sort()) {
  const lines = fs.readFileSync(path.join(dir, file), 'utf8').split('\n');
  let insideCreate = false;

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('--') || trimmed === '') return;

    if (/^create table\b/i.test(trimmed)) {
      insideCreate = true;
      return;
    }
    if (insideCreate && trimmed.startsWith(')')) {
      insideCreate = false;
      return;
    }

    const column = insideCreate ? COLUMN_LINE.exec(trimmed)?.[1] : ADD_COLUMN.exec(line)?.[1];
    if (
      column &&
      RESERVED.has(column.toLowerCase()) &&
      !ALLOWED.has(`${file}:${column.toLowerCase()}`)
    ) {
      problems.push(`${file}:${index + 1}  column "${column}" is a reserved word`);
    }
  });
}

if (problems.length > 0) {
  console.log('Reserved words used as column names:\n');
  for (const problem of problems) console.log(`  ${problem}`);
  console.log(
    '\nRename them. Postgres accepts these unquoted; the Supabase SQL editor,\n' +
      'which parses statements itself, refuses them.',
  );
  process.exit(1);
}

console.log('no reserved words used as column names');
