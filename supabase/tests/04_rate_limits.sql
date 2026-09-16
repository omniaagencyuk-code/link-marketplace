\pset tuples_only on
\pset format unaligned

-- Limit of 3 in a 60 second window.
select 'attempt 1 wait=' || public.consume_rate_limit('test:1.2.3.4', 3, 60);
select 'attempt 2 wait=' || public.consume_rate_limit('test:1.2.3.4', 3, 60);
select 'attempt 3 wait=' || public.consume_rate_limit('test:1.2.3.4', 3, 60);
select 'attempt 4 blocked, wait>0: ' || (public.consume_rate_limit('test:1.2.3.4', 3, 60) > 0);

-- A different caller has its own counter.
select 'other caller allowed, wait=' || public.consume_rate_limit('test:5.6.7.8', 3, 60);

-- A different action has its own counter for the same caller.
select 'other action allowed, wait=' || public.consume_rate_limit('signup:1.2.3.4', 3, 60);

-- An expired window starts again rather than staying blocked forever.
update public.rate_limits set expires_at = timezone('utc', now()) - interval '1 second'
  where bucket = 'test:1.2.3.4';
select 'after the window, allowed again, wait=' || public.consume_rate_limit('test:1.2.3.4', 3, 60);
select 'and the count restarted at 1: ' || (count = 1) from public.rate_limits where bucket = 'test:1.2.3.4';

-- Nobody but an admin may read the counters.
set role anon;
select 'anon reads rate_limits: ' || count(*) from public.rate_limits;
reset role;
