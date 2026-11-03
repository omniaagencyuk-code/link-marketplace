import { neverContactSegments } from '@/lib/config/sales-segments';

/**
 * What each sweep is waiting on, written down once.
 *
 * The dashboard offers a Start button beside a count of what that sweep would
 * pick up. Those were two different computations: the sweep asked the database
 * for its queue, and the card did arithmetic on the funnel - `prospects` minus
 * `researched`. They agree right up until a stage can fail.
 *
 * It took one real run to show. 323 sites researched, 265 read, 58 refused by
 * their own bot protection; a refusal is written as `research_status =
 * 'failed'` and the sweep only ever claims `pending`, so the queue was empty
 * while the card said "58 waiting" over a button that would start a run,
 * find nothing, and mark itself completed. The number was not stale or
 * rounded. It was a different question's answer.
 *
 * So a queue is defined here, as data, and the same definition is applied
 * both to the query that claims work and to the query that counts it. Not
 * because duplication is untidy - because the two copies disagree exactly
 * when something has gone wrong, which is the moment somebody is reading the
 * number to find out what happened.
 *
 * ## Follow-ups are not here, on purpose
 *
 * `salesFollowUpService` picks its queue by reading sent emails, narrowing to
 * the latest step per prospect in code, and then asking of each one whether
 * they replied, moved stage, or unsubscribed. None of that is a filter, so a
 * count of it would be a second computation of the kind this module exists to
 * remove. Its card shows no number, which is the honest version of not
 * knowing.
 */

/**
 * One predicate, as data rather than as a call.
 *
 * The four shapes the queues below need, and no more: a shape added here is a
 * shape `applyQueue` has to translate, and every one of them is a chance for
 * the count and the claim to diverge again.
 */
export type QueueCondition =
  | { op: 'eq'; column: string; value: string | number | boolean }
  | { op: 'isNull'; column: string }
  | { op: 'gte'; column: string; value: number }
  | { op: 'notIn'; column: string; values: readonly string[] };

export type Queue = readonly QueueCondition[];

/**
 * The minimal surface `applyQueue` needs.
 *
 * Declared structurally rather than as PostgREST's own builder type so the
 * suite can hand it a recorder and read back exactly what was applied.
 */
export interface QueueTarget {
  eq(column: string, value: unknown): QueueTarget;
  is(column: string, value: unknown): QueueTarget;
  gte(column: string, value: unknown): QueueTarget;
  not(column: string, operator: string, value: unknown): QueueTarget;
}

/**
 * Apply a queue to a query.
 *
 * Every condition, in order, and nothing else. The caller supplies the select
 * - `select('id')` to claim the rows, `select('id', { count: 'exact', head:
 * true })` to count them - which is the only difference there should ever be
 * between the two.
 */
export function applyQueue<Q>(query: Q, queue: Queue): Q {
  /*
    `Q` is unconstrained, and the builder is cast rather than checked.

    Constraining it to `QueueTarget` reads better and does not compile:
    PostgREST's builder carries the parsed row type through every method
    signature, and structurally matching four of them against a select as
    wide as `PROSPECT_SELECT` makes the compiler give up - "type
    instantiation is excessively deep". A column or two gets through, which
    is the worst version of the problem, because it means the constraint
    compiles until somebody uses it on a real select.

    So the cast is deliberate and it is confined to these few lines. What it
    gives up is narrow: a caller could hand this something that is not a
    query. What it keeps is the thing worth keeping - the queue is applied
    from one definition, and `Q` passes through unchanged, so `.order()` and
    `.limit()` after the call are still checked against the real builder.
  */
  let built = query as QueueTarget;

  for (const condition of queue) {
    switch (condition.op) {
      case 'eq':
        built = built.eq(condition.column, condition.value);
        break;
      case 'isNull':
        built = built.is(condition.column, null);
        break;
      case 'gte':
        built = built.gte(condition.column, condition.value);
        break;
      case 'notIn':
        // Rendered by hand: PostgREST wants `not.in.(a,b)` and the builder
        // takes the list already bracketed.
        built = built.not(condition.column, 'in', `(${condition.values.join(',')})`);
        break;
    }
  }

  return built as Q;
}

/** Waiting to have their website read. */
export const RESEARCH_QUEUE: Queue = [{ op: 'eq', column: 'research_status', value: 'pending' }];

/**
 * Read, and never put to the model under the current prompt.
 *
 * `qualified is null` rather than `stage = 'new'`, for the reason the sweep
 * records: a prospect somebody moved by hand is still unread, and one
 * re-researched after a redesign should be read again.
 */
export const QUALIFY_QUEUE: Queue = [
  { op: 'eq', column: 'research_status', value: 'done' },
  { op: 'isNull', column: 'qualified' },
];

/**
 * Worth spending a Hunter credit on: qualified, above the floor, not a
 * competitor, and nobody found yet.
 *
 * The segment test is a deny-list, matching `isContactable` rather than
 * restating it the other way round. An allow-list would quietly drop a
 * segment the day somebody adds one to the config, and the symptom - a few
 * prospects that never reach the contact sweep - is not one anybody would
 * connect back to this line.
 */
export function contactsQueue(minScore: number): Queue {
  return [
    { op: 'eq', column: 'qualified', value: true },
    { op: 'gte', column: 'score', value: minScore },
    { op: 'eq', column: 'stage', value: 'qualified' },
    { op: 'eq', column: 'contacts_status', value: 'pending' },
    { op: 'notIn', column: 'segment', values: neverContactSegments },
  ];
}

/**
 * Whether a sweep card should refuse to start.
 *
 * A sweep over an empty queue is not harmless: it claims a run, finds no
 * rows, and finishes `completed` - a row on Recent sweeps indistinguishable
 * from a sweep that did the work. Refusing says the same thing without
 * leaving that behind.
 *
 * **Undefined is not zero.** A card with no count - follow-ups, whose queue
 * cannot be counted without recomputing it - keeps its button. Not knowing
 * what is waiting is a different statement from knowing nothing is, and
 * collapsing the two would disable the one sweep nobody can check first.
 */
export function nothingWaiting(waiting: number | undefined): boolean {
  return waiting === 0;
}
