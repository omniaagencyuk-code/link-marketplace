/**
 * Session tokens must not be interchangeable.
 *
 * The customer secret falls back to ADMIN_SESSION_SECRET when
 * AUTH_SESSION_SECRET is unset, so both session types can be signed with the
 * same key. A customer payload satisfies the admin verifier's shape check, so
 * without an audience claim the customer cookie could be pasted into the admin
 * cookie and would verify.
 */
process.env.ADMIN_SESSION_SECRET = 'test-secret-for-session-verification';
delete process.env.AUTH_SESSION_SECRET;

const { createAdminSessionToken, verifyAdminSessionToken } = await import('../src/lib/auth/admin-session');
const { createCustomerSessionToken, verifyCustomerSessionToken, customerSessionSecret } =
  await import('../src/lib/auth/customer-session');

let failures = 0;
const check = (label: string, actual: unknown, expected: unknown) => {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    console.log(`  PASS  ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${label}\n        expected ${JSON.stringify(expected)}\n        got      ${JSON.stringify(actual)}`);
  }
};

check('both session types share one key (the condition under test)',
  customerSessionSecret(), process.env.ADMIN_SESSION_SECRET);

const adminToken = (await createAdminSessionToken('james@omniaagency.co'))!;
const customerToken = (await createCustomerSessionToken('usr_1', 'james@omniaagency.co'))!;

check('an admin token verifies as an admin',
  (await verifyAdminSessionToken(adminToken))?.email, 'james@omniaagency.co');
check('a customer token verifies as a customer',
  (await verifyCustomerSessionToken(customerToken))?.sub, 'usr_1');

// The escalation: same key, and {sub,email,exp} satisfies the admin shape check.
check('a customer token is REFUSED by the admin verifier',
  await verifyAdminSessionToken(customerToken), null);
check('an admin token is REFUSED by the customer verifier',
  await verifyCustomerSessionToken(adminToken), null);

// A token minted before audiences existed has no `aud` and must be refused.
const legacy = await (async () => {
  const payload = { email: 'james@omniaagency.co', exp: Date.now() + 3_600_000 };
  const enc = new TextEncoder();
  const b64 = (b: Uint8Array) => {
    let s = ''; for (const x of b) s += String.fromCharCode(x);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };
  const body = b64(enc.encode(JSON.stringify(payload)));
  const key = await crypto.subtle.importKey('raw', enc.encode(process.env.ADMIN_SESSION_SECRET!),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(body));
  return `${body}.${b64(new Uint8Array(sig))}`;
})();
check('a correctly signed token with no audience is refused',
  await verifyAdminSessionToken(legacy), null);

// Tampering must still fail.
check('a token with a swapped payload is refused',
  await verifyAdminSessionToken(`${adminToken.split('.')[0]}x.${adminToken.split('.')[1]}`), null);

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
