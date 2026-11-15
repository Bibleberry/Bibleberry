# Temporary CI benchmark: two Linux runners

This file is a **non-production benchmark marker** used solely to validate parallel
GitHub Actions scheduling after the BigMac Ubuntu VM was upgraded to 4 vCPUs and
12 GiB RAM and a second runner was registered.

Why this location: `scripts/ci/check-scope.mjs` declares `tests/ci/` as a universal
scope trigger. This change therefore asks the existing CI workflows to execute
their real Reader, CMS/BerryMark, Release Gateway, Sanity Studio and Collections
Browser checks, without modifying any application or test logic.

**Expected result:** GitHub assigns jobs from this single PR to both
`bibleberry-bigmac` and `bibleberry-bigmac-2` while their executions overlap.

**Benchmarks:** compare job `started_at`, `completed_at`, and `runner_name`
in the GitHub Actions API; total verification wall clock starts at the first
job's start and ends when the last required Linux job finishes.

**Disposition:** Close this diagnostic PR without merging after observing the
results. No permanent repository change is required.
