/**
 * Facts about the business behind the public pages, kept in one place so
 * the legal pages, the footer and the contact links never disagree. Check
 * these with whoever runs Issueit before relying on the legal pages.
 */
export const company = {
  name: "Issueit",
  domain: "issueit.app",
  /** Courts and law that govern the terms. */
  law: "England and Wales",
  /** How long deleted data can survive in backups before they're overwritten. Confirm against the real backup rotation. */
  backupDays: 30,
  /** Notice before a significant change to the terms takes effect. */
  noticeDays: 30,
  /** When the terms, privacy and cookie pages last changed. */
  legalUpdated: "30 October 2026",
  email: {
    hello: "hello@issueit.app",
    privacy: "privacy@issueit.app",
    security: "security@issueit.app",
    legal: "legal@issueit.app",
    jobs: "jobs@issueit.app",
  },
};
