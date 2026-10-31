import { z } from "zod";

/**
 * Prompts are the jobs people actually bring to a bug tracker, written out
 * once so nobody has to describe them again. They say what to do, in order,
 * and name the tools to use.
 */

export type PromptDef = {
  name: string;
  title: string;
  description: string;
  args: Record<string, z.ZodType>;
  build(args: Record<string, string | undefined>): string;
};

const inProject = (p?: string) => (p ? ` in the project "${p}"` : "");

export const prompts: PromptDef[] = [
  {
    name: "triage",
    title: "Triage the open bugs",
    description: "Read the open reports, group the duplicates, set honest priorities, and say what to fix first.",
    args: { project: z.string().optional().describe("Limit to one project.") },
    build: (a) => `Triage the open bug reports${inProject(a.project)}.

1. Call search_reports with status "open"${a.project ? ` and project "${a.project}"` : ""}.
2. Open anything unclear with get_report. Read the console errors and the steps, not just the title — people describe the symptom, the diagnostics show the cause.
3. Where two reports are plainly the same bug, join them with group_reports, keeping the one with the better evidence as the parent.
4. Set priorities with update_report, judged by what the diagnostics show rather than by how the reporter phrased it: anything that loses someone's work or blocks a purchase is critical, however politely it was reported.
5. Finish with a short list, worst first: what the bug is, how many people hit it, and what you would look at in the code.

Change status only where you are sure. Don't resolve anything you haven't fixed.`,
  },

  {
    name: "fix_bug",
    title: "Fix a reported bug",
    description: "Read one report's evidence, reproduce it, fix it in this codebase, and mark it resolved.",
    args: { report: z.string().describe("A report id or its number."), project: z.string().optional() },
    build: (a) => `Fix the bug in report ${a.report}${inProject(a.project)}.

1. get_report ${a.report}${a.project ? ` with project "${a.project}"` : ""}. Read all of it: the description, the console errors with their stacks, the requests the page made, and the steps taken.
2. From the stack and the page address, find the code that is at fault in this repository. Say which file and line you believe is wrong, and why, before changing anything.
3. Write a failing test that reproduces it if the project has tests. Then fix it.
4. Check whether the same fault explains any duplicates grouped with the report.
5. Once the fix is committed and shipped, call resolve_report, which also emails the people who asked to hear about it. Don't resolve it before it is actually shipped.

If the evidence isn't enough to find the fault, say so plainly and name what you would need: a repro, a source map, or a log — rather than guessing at a fix.`,
  },

  {
    name: "set_up_bug_reporting",
    title: "Set up bug reporting for this app",
    description: "Create a project, put the widget in, send the reports somewhere, and prove it works.",
    args: { name: z.string().optional().describe("What to call the project."), framework: z.string().optional().describe("html, react, next, vue, svelte, node or curl.") },
    build: (a) => `Set up Issueit bug reporting for this app.

1. whoami, to see what this token may do.
2. Work out the framework from the repository${a.framework ? ` (the person says it is ${a.framework})` : ""} rather than asking.
3. setup_project with the name ${a.name ? `"${a.name}"` : "of this app"} and that framework, then add the snippet to the real file it belongs in — the root layout, not a new one — and set the project's allowed sites to the app's actual addresses.
4. list_connections to see what is already connected. If something suitable is there, create_destination pointing at it; if nothing is, say which service would suit and that a person must connect it in the dashboard, because connecting needs a browser.
5. test_destination, and read the result.
6. diagnose_install with the app's address, and fix whatever it reports.

Tell the person what you did in a few lines, including the project id and where their bugs will arrive.`,
  },

  {
    name: "weekly_digest",
    title: "This week in bugs",
    description: "What came in, what it means, and what is quietly broken in the delivery pipeline.",
    args: { project: z.string().optional() },
    build: (a) => `Write a short digest of the last week's bugs${inProject(a.project)}.

1. get_analytics with range "7d"${a.project ? ` for "${a.project}"` : ""}.
2. search_reports with status "open", sorted as it comes, and again with failing true to catch reports nobody was told about.
3. list_destinations, and note anything paused or failing.

Then write, in plain prose and under 300 words: what changed from the week before, the two or three bugs that matter most and why, anything that is failing to deliver, and one thing worth doing about it. No bullet-point padding, and no praise for numbers that only went down because fewer people visited.`,
  },
];
