# Cloudflare PR preview smoke-test marker

**Issue:** #21 (secure Cloudflare live Lab and PR previews)
**Purpose:** Temporary, non-production infrastructure probe.
**Branch:** `test/cloudflare-pr-preview-20261101`
**Probe revision:** 1

This documentation-only file is deliberately added on a feature branch to trigger the GitHub pull-request workflow and Cloudflare preview deployment. It does not alter application code, content, or configuration.

Validation goals:
- Verify a separate preview URL is generated for this PR.
- Verify the preview requires authorized Cloudflare Access authentication.
- Verify the preview uses a normal reader build, excluding Developer Studio and the Interactive Challenge Lab from its assets.
- Verify a subsequent commit to this branch produces an updated preview while the stable Lab remains unchanged.

**Do not merge this test PR into `main`.** After recording evidence under Issue #21, close the PR and remove its branch only with Aaron's approval.