# Temporary CI benchmark: three Linux runners

This file is a **non-production benchmark marker** used solely to validate parallel
GitHub Actions scheduling after the BigMac Ubuntu VM was upgraded to 4 vCPUs and
12 GiB RAM and three independent Linux runners were registered.

Why this location: `scripts/ci/check-scope.mjs` declares `tests/ci/` as a universal
scope trigger. This change therefore asks the existing CI workflows to execute
their real Reader, CMS/BerryMark, Release Gateway, Sanity Studio and Collections
Browser checks, without modifying any application or test logic.

**Expected result:** GitHub assigns jobs from this single PR to
`bibleberry-bigmac`, `bibleberry-bigmac-2`, and `bibleberry-bigmac-3`
with overlapping execution intervals. Record whether all three are used.

**Benchmarks:** compare job `started_at`, `completed_at`, `runner_name`,
and run wall clock against the prior two-runner run at commit `827d118`.
The important metric is total CI wall-clock time, not simply the number
of runners that accept a job. All three runners share 4 vCPUs / 12 GiB RAM.

**Disposition:** Close this diagnostic PR without merging after observing
the results. No permanent repository change is required.
