# Security reports

Do not post keys, private drafts, browser storage, or exploit details in a public issue.

Use the repository host's private vulnerability-reporting feature when available. Otherwise, contact the maintainer through the profile linked from the repository and request a private channel before sending details.

Include the affected version, browser, minimal reproduction steps, and expected impact. Use a test account and synthetic data. If a key was exposed, revoke it through TypeSafe.

Fixes target the latest release. The extension stores a user-supplied TypeSafe key in extension-owned IndexedDB. It does not encrypt the key itself. Feed and draft assessment have separate consent controls. Unpublished drafts can leave the device only after draft scoring is enabled.
