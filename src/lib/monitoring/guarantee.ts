/**
 * The guarantee's figures, in one place.
 *
 * These four numbers decide what a buyer is owed and when, and they are now
 * read by three different things: the checker that schedules the next look,
 * the service that opens a claim and gives the publisher a deadline, and the
 * refund policy page that tells a customer what the guarantee is. The first
 * two had their own copies and the third would have been a sentence somebody
 * typed into a markdown field.
 *
 * A guarantee published as prose and enforced as a constant is a guarantee
 * that will one day say twelve months on the page and mean six in the code -
 * and the copy a customer reads is the copy they would hold us to. So the
 * page renders these rather than restating them, and `verify:sections` fails
 * if the editable body starts quoting a figure of its own.
 *
 * Changing one of these changes the public promise. That is the point.
 */

/** Twelve months, which is what the marketing says. */
export const GUARANTEE_MONTHS = 12;

/**
 * How long a publisher gets before it becomes the buyer's choice.
 *
 * Fourteen days. Long enough for somebody who only reads their email on
 * Mondays and is halfway through a site migration; short enough that a buyer
 * is not left waiting a month to find out they can have their money back.
 */
export const PUBLISHER_GRACE_DAYS = 14;

/** How often a link is looked at while the guarantee runs. */
export const CHECK_EVERY_DAYS = 7;

/**
 * And afterwards.
 *
 * Monthly, because the durability score keeps earning from links long after
 * their guarantee ends and a listing's score is the thing a new buyer reads.
 */
export const CHECK_AFTER_GUARANTEE_DAYS = 30;
