/**
 * Build the synthetic test mbox.
 *
 * Every message here is invented. The domains are deliberately not real
 * publishers and the addresses are @example.* - this file exists to exercise
 * the parser and the extraction rules, and must never be mistaken for a
 * record of anyone's actual rates.
 *
 * The cases mirror the shapes seen in a real Takeout export: our own sent
 * mail, a bounce, base64 and quoted-printable bodies, an html-only reply,
 * a multi-site network reply, a reply whose contact differs from its sender,
 * and replies with nothing usable in them.
 */
import fs from 'node:fs';
import path from 'node:path';

const messages = [];

/** The mbox separator takes the bare envelope address and an asctime date. */
function envelopeLine(from, date) {
  const address = /<([^>]+)>/.exec(from)?.[1] ?? from;
  const when = new Date(date).toUTCString().replace(
    /^(\w{3}), (\d{2}) (\w{3}) (\d{4}) (\S+) GMT$/,
    '$1 $3 $2 $5 $4',
  );
  return `From ${address} ${when}`;
}

function add({ from, to = 'jack@omniamedia.uk', subject, date, body, encoding = '7bit', contentType = 'text/plain; charset="utf-8"', id }) {
  let payload = body;
  if (encoding === 'base64') {
    payload = Buffer.from(body, 'utf8').toString('base64').replace(/(.{76})/g, '$1\n');
  } else if (encoding === 'quoted-printable') {
    payload = body
      .split('')
      .map((ch) => {
        const code = ch.charCodeAt(0);
        if (ch === '=') return '=3D';
        if (code > 126 || (code < 32 && ch !== '\n')) {
          return [...Buffer.from(ch, 'utf8')].map((b) => `=${b.toString(16).toUpperCase().padStart(2, '0')}`).join('');
        }
        return ch;
      })
      .join('');
  }

  messages.push(
    [
      envelopeLine(from, date),
      `Message-ID: <${id}@mail.example>`,
      `From: ${from}`,
      `To: ${to}`,
      `Subject: ${subject}`,
      `Date: ${date}`,
      `Content-Type: ${contentType}`,
      `Content-Transfer-Encoding: ${encoding}`,
      '',
      payload,
      '',
    ].join('\n'),
  );
}

const QUOTE = `

On Mon, 22 Sep 2026 at 09:14, Jack <jack@omniamedia.uk> wrote:
> Hi there,
> I'm getting in touch about advertising options on your site.
> We place guest posts and link insertions for clients in a range of
> industries including gambling, crypto and finance. Could you send
> over your rates?
> Thanks, Jack`;

// --- our own outreach: must be skipped -------------------------------------
add({
  from: 'jack@omniamedia.uk',
  to: 'editor@quietharbour.example',
  subject: 'Advertisements on quietharbour.example',
  date: 'Mon, 22 Sep 2026 09:14:00 +0100',
  id: 'outreach-1',
  body: "Hi there,\nI'm getting in touch about advertising options on your site.\nThanks, Jack",
});

// --- a bounce: must be skipped ---------------------------------------------
add({
  from: 'MAILER-DAEMON@mail.example',
  subject: 'Undeliverable: Advertisements on nuovaquadra.example',
  date: 'Mon, 22 Sep 2026 09:16:00 +0100',
  id: 'bounce-1',
  body: 'Your message to redazione@nuovaquadra.example could not be delivered.\n550 5.1.1 unknown recipient',
});

// --- multi-site network, one price and one exception -----------------------
add({
  from: 'Mette Holm <mette@holdsport.example>',
  subject: 'Re: Advertisements on holdsport.example',
  date: 'Mon, 22 Sep 2026 11:02:00 +0200',
  id: 'network-1',
  body: `Hi Jack,

Thanks for reaching out. We operate the following sites:

holdsport.example
traeningsguiden.example
loebeklubben.example
cykelnyt.example
haandboldavisen.example
svoemmesport.example
atletikbladet.example
fodboldfokus.example
tennisugen.example
golfbanen.example

Price is 400 EUR per guest post on any of these, we write the article or you
send it, same price either way.

We also have sportmember.no which is 500 EUR.

We only accept gambling and loan content - no general or lifestyle posts,
they don't fit our audience. Links are dofollow and permanent.

Payment by bank transfer after the post is live. Prices exclude VAT.

Best regards
Mette${QUOTE}`,
});

// --- network with a per-site exception, quoted-printable -------------------
add({
  from: 'news@deadlineledger.example',
  subject: 'RE: Advertisements on deadlineledger.example',
  date: 'Mon, 22 Sep 2026 13:40:00 +0100',
  encoding: 'quoted-printable',
  id: 'network-2',
  body: `Hello Jack,

Our network — ten titles in total:

deadlineledger.example, northernrecord.example, thelochsidepress.example,
harbourwatch.example, glenreview.example, firthgazette.example,
moorlandtimes.example, borderbulletin.example, seacliffherald.example,
thekelpiereview.example

£250 per placement across the network. Sensitive niches £450.

Please note thelochsidepress.example does not take gambling at any price.

Regards,
The Deadline Ledger team${QUOTE}`,
});

// --- itemised per-niche pricing, base64 ------------------------------------
add({
  from: 'Priya Nair <priya@businessvantage.example>',
  subject: 'Re: Advertisements on businessvantage.example',
  date: 'Mon, 22 Sep 2026 15:20:00 +0100',
  encoding: 'base64',
  id: 'itemised-1',
  body: `Hi Jack,

Our rates:

General topics — £100
Crypto, forex, loans — £150
CBD, gambling, adult — £350

Link insertion: same rates apply as above based on niche.

We do not tag posts as sponsored. Maximum 1 link per article.
Content 800-1500 words, we can publish within 48 hours.

Thanks,
Priya${QUOTE}`,
});

// --- dofollow with an expiry, and two refusals ------------------------------
add({
  from: 'editor@twistedcircuit.example',
  subject: 'Re: Advertisements on twistedcircuit.example',
  date: 'Tue, 23 Sep 2026 08:05:00 +0100',
  id: 'expiry-1',
  body: `Hey,

$220 for a guest post, you supply the content. $260 if we write it.

Links stay dofollow for 12 months, after that we add a sponsored tag.

We don't do gambling or adult, sorry. Everything else is fine.

Cheers${QUOTE}`,
});

// --- non-GBP currency, two payment methods, html only -----------------------
add({
  from: 'Camila Duarte <camila@modabolha.example>',
  subject: 'Re: Advertisements on modabolha.example',
  date: 'Tue, 23 Sep 2026 10:30:00 -0300',
  contentType: 'text/html; charset="utf-8"',
  encoding: 'quoted-printable',
  id: 'currency-1',
  body: `<html><body><p>Ol&aacute; Jack,</p>
<p>Nossos valores para post patrocinado:</p>
<table>
<tr><td>Via PayPal</td><td>R$1.130</td></tr>
<tr><td>Via Pix</td><td>R$980</td></tr>
</table>
<p>Aceitamos todos os temas, inclusive apostas e criptomoedas, sem taxa adicional.</p>
<p>Prazo de publica&ccedil;&atilde;o: at&eacute; 3 dias &uacute;teis.</p>
<p>Abra&ccedil;os,<br>Camila</p>
</body></html>`,
});

// --- the reply names a different contact than the sender --------------------
add({
  from: 'Giulia Zanotti <giulia.zanotti@webmail.example>',
  subject: 'R: Advertisements on nuovaquadra.example',
  date: 'Tue, 23 Sep 2026 12:00:00 +0200',
  encoding: 'quoted-printable',
  id: 'contact-1',
  body: `Buongiorno,

scrivo dall'indirizzo personale perché la casella redazione@ non funziona più.
Per favore usate questo indirizzo per i prossimi contatti.

Articolo sponsorizzato: 180 EUR. Scriviamo noi il testo: 220 EUR.
Non accettiamo contenuti per adulti.
Link dofollow, permanente.

Cordiali saluti
Giulia Zanotti
Nuova Quadra${QUOTE}`,
});

// --- German, single price, no niches mentioned ------------------------------
add({
  from: 'redaktion@klatschrunde.example',
  subject: 'AW: Advertisements on your website',
  date: 'Tue, 23 Sep 2026 14:45:00 +0200',
  encoding: 'quoted-printable',
  id: 'single-1',
  body: `Sehr geehrter Herr,

vielen Dank für Ihre Anfrage. Ein Gastbeitrag kostet 150 EUR.

Mit freundlichen Grüßen
Redaktion
klatschrunde.example${QUOTE}`,
});

// --- a site we didn't ask about, offered instead ----------------------------
add({
  from: 'team@happygathering.example',
  subject: 'Re: Advertisements on happygathering.example',
  date: 'Tue, 23 Sep 2026 16:10:00 +0200',
  id: 'offered-1',
  body: `Hi Jack,

We don't publish sponsored posts on happygathering.example any more.

However we also run klatschtratsch.example which does accept them - 120 EUR
per post, any topic including gambling.

Best${QUOTE}`,
});

// --- canned reply, no domain identifiable: must be ignored ------------------
add({
  from: 'no-reply@mediadeskhub.example',
  subject: 'Re: Advertisements on your website',
  date: 'Wed, 24 Sep 2026 09:00:00 +0100',
  id: 'canned-1',
  body: `Thank you for contacting us. Your enquiry is important to us and a member
of the team will respond within 5 working days.

This is an automated response. Please do not reply.${QUOTE}`,
});

// --- invitation to a rate card with no prices: must be ignored --------------
add({
  from: 'sales@linkparadeagency.example',
  subject: 'Re: Advertisements on your website',
  date: 'Wed, 24 Sep 2026 09:30:00 +0100',
  id: 'nopricing-1',
  body: `Hi there,

Great to hear from you! We have over 4,000 sites available.

Please register at our portal to view the full inventory and pricing.

Thanks${QUOTE}`,
});

const out = path.join(process.cwd(), 'scripts/fixtures/sourcing-synthetic.mbox');
fs.writeFileSync(out, messages.join('\n'), 'utf8');
console.log(`wrote ${messages.length} messages to ${out}`);
