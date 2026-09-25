#!/usr/bin/env node
/**
 * Rewrite a migration so it survives a hostile paste.
 *
 * The Supabase SQL editor is where these are actually run, by hand, in a
 * browser. Three runs of one migration failed in three different ways, all
 * with the same shape: a multi-line statement arriving without its first
 * line. Whatever collapses those newlines, a `--` comment then swallows the
 * statement that followed it, and what reaches the server is a fragment.
 *
 * So this removes both conditions rather than arguing with them. Line
 * comments go, and every statement is emitted on a single line. A file with
 * no line comments and no multi-line statements cannot be broken by losing a
 * newline, because there is nothing on a second line to lose.
 *
 * Generated, never hand-written. A paste-safe copy maintained by hand would
 * drift from the real migration within a month, and the stale one is always
 * the one somebody runs.
 *
 *   node scripts/flatten-migration.mjs supabase/migrations/0023_x.sql
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';

/**
 * Remove every comment, respecting what is data and what is not.
 *
 * Applied to dollar-quoted bodies as well as to the top level, which it was
 * not: a `do $$ ... $$` block was copied through whole and then had its
 * whitespace collapsed, so the `--` comments inside it ended up on one line
 * and swallowed the rest of the block. The result was a file that failed with
 * "syntax error at end of input", which is what an unterminated statement
 * looks like when half of it has been commented out.
 *
 * A comment inside a string literal is not a comment, so quotes are tracked
 * here too.
 */
function stripComments(sql) {
  let out = '';
  let i = 0;

  while (i < sql.length) {
    const rest = sql.slice(i);

    if (rest.startsWith('--')) {
      const end = sql.indexOf('\n', i);
      i = end === -1 ? sql.length : end;
      // Left in place of the comment so the tokens either side stay apart.
      out += ' ';
      continue;
    }

    if (rest.startsWith('/*')) {
      const end = sql.indexOf('*/', i + 2);
      i = end === -1 ? sql.length : end + 2;
      out += ' ';
      continue;
    }

    const dollar = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(rest);
    if (dollar) {
      const tag = dollar[0];
      const end = sql.indexOf(tag, i + tag.length);
      if (end === -1) throw new Error(`Unterminated dollar quote ${tag}`);
      // The body is code, so its comments go the same way. Recursing rather
      // than copying through is the whole fix.
      const body = sql.slice(i + tag.length, end);
      out += tag + stripComments(body) + tag;
      i = end + tag.length;
      continue;
    }

    if (rest.startsWith("'")) {
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === "'" && sql[j + 1] === "'") j += 2;
        else if (sql[j] === "'") break;
        else j += 1;
      }
      if (j >= sql.length) throw new Error('Unterminated string literal');
      out += sql.slice(i, j + 1);
      i = j + 1;
      continue;
    }

    out += sql[i];
    i += 1;
  }

  return out;
}

/**
 * Split SQL into statements, respecting the two things that make naive
 * splitting wrong: single-quoted strings, and dollar-quoted blocks whose
 * bodies are full of semicolons.
 */
function statements(sql) {
  const out = [];
  let current = '';
  let i = 0;

  while (i < sql.length) {
    const rest = sql.slice(i);

    // A dollar-quoted block is copied through whole, semicolons and all.
    const dollar = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(rest);
    if (dollar) {
      const tag = dollar[0];
      const end = sql.indexOf(tag, i + tag.length);
      if (end === -1) throw new Error(`Unterminated dollar quote ${tag}`);
      current += sql.slice(i, end + tag.length);
      i = end + tag.length;
      continue;
    }

    // A string literal is copied through whole, doubled quotes included.
    if (rest.startsWith("'")) {
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === "'" && sql[j + 1] === "'") j += 2;
        else if (sql[j] === "'") break;
        else j += 1;
      }
      if (j >= sql.length) throw new Error('Unterminated string literal');
      current += sql.slice(i, j + 1);
      i = j + 1;
      continue;
    }

    if (sql[i] === ';') {
      out.push(current);
      current = '';
      i += 1;
      continue;
    }

    current += sql[i];
    i += 1;
  }

  if (current.trim()) out.push(current);
  return out;
}

/**
 * Collapse a statement to one line.
 *
 * Whitespace outside strings and dollar-quoted bodies becomes a single
 * space. Inside them it is left exactly as it is: a string literal is data,
 * and reformatting one would change what the migration writes.
 */
function oneLine(statement) {
  let out = '';
  let i = 0;

  while (i < statement.length) {
    const rest = statement.slice(i);

    const dollar = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(rest);
    if (dollar) {
      const tag = dollar[0];
      const end = statement.indexOf(tag, i + tag.length);
      const body = statement.slice(i, end + tag.length);
      // The body is code, not data, so its newlines may go - and must, or
      // the statement is multi-line again.
      out += body.replace(/\s+/g, ' ');
      i = end + tag.length;
      continue;
    }

    if (rest.startsWith("'")) {
      let j = i + 1;
      while (j < statement.length) {
        if (statement[j] === "'" && statement[j + 1] === "'") j += 2;
        else if (statement[j] === "'") break;
        else j += 1;
      }
      out += statement.slice(i, j + 1);
      i = j + 1;
      continue;
    }

    if (/\s/.test(statement[i])) {
      if (!out.endsWith(' ')) out += ' ';
      i += 1;
      continue;
    }

    out += statement[i];
    i += 1;
  }

  return out.trim();
}

const source = process.argv[2];
if (!source) {
  console.error('usage: node scripts/flatten-migration.mjs <migration.sql>');
  process.exit(1);
}

const sql = stripComments(readFileSync(source, 'utf8'));
const flattened = statements(sql)
  .map(oneLine)
  .filter(Boolean)
  .map((statement) => `${statement};`)
  .join('\n');

const target = source.replace(/\.sql$/, '.paste.sql');
// The header is a block comment, not line comments. A `--` header would be
// the first casualty of the very fault this file exists to survive: lose the
// newline after it and it swallows the statement below. `*/` ends where it
// says it ends, whatever happens to the whitespace.
writeFileSync(
  target,
  `/* ${basename(source)}, flattened for the Supabase SQL editor. ` +
    `Generated by scripts/flatten-migration.mjs - do not edit this file, ` +
    `edit the migration and run the script again. One statement per line, ` +
    `no line comments, nothing to lose to a newline. The commentary lives ` +
    `in the migration itself. */\n${flattened}\n`,
);

// The invariant this file exists for: nothing on a second line, and no line
// comment anywhere to swallow one. Checked rather than assumed, because the
// failure mode is a file that looks fine and applies half of itself.
for (const [index, line] of flattened.split('\n').entries()) {
  if (line.includes('--')) {
    throw new Error(`Line ${index + 1} still has a line comment: ${line.slice(0, 80)}`);
  }
}

console.log(`${target}: ${flattened.split('\n').length} statements, longest line ${
  Math.max(...flattened.split('\n').map((l) => l.length))
} chars`);
