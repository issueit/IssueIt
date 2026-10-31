import type { ComponentType } from "react";
import { startPages } from "./content/start";
import { collectPages } from "./content/collect";
import { deliverPages } from "./content/deliver";
import { reportPages } from "./content/reports";
import { automatePages } from "./content/automate";
import { referencePages } from "./content/reference";
import { selfHostPages } from "./content/selfhost";

/** Slug to page body. The nav decides what exists; this decides what it says. */
export const pages: Record<string, ComponentType> = {
  ...startPages,
  ...collectPages,
  ...deliverPages,
  ...reportPages,
  ...automatePages,
  ...referencePages,
  ...selfHostPages,
};
