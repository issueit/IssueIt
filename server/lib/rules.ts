import type { ProjectRules } from "../db/schema";

/**
 * Checks a project's own grouping and redaction patterns. It lives here, on
 * its own, because both the dashboard's settings endpoint and the project
 * configuration document need it: when it sat next to one of them, the two
 * modules imported each other, and which of them finished loading first
 * decided whether the server started at all.
 */

/** Every pattern is compiled here so a bad one is refused at the door, not at intake. */
export function checkRules(rules: ProjectRules): string[] {
  const problems: string[] = [];
  for (const pattern of rules.grouping?.titlePatterns ?? []) {
    try {
      new RegExp(pattern);
    } catch (err) {
      problems.push(`Grouping pattern ${JSON.stringify(pattern)} isn't a valid regular expression: ${(err as Error).message}`);
    }
  }
  for (const rule of rules.redaction?.patterns ?? []) {
    try {
      new RegExp(rule.pattern);
    } catch (err) {
      problems.push(`Redaction pattern ${JSON.stringify(rule.pattern)} isn't a valid regular expression: ${(err as Error).message}`);
    }
  }
  return problems;
}
