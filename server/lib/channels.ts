import { z } from "zod";
import type { ProjectChannel } from "../db/schema";

/**
 * Channels: named ways into a project, each with its own webhook address
 * and its own destinations. A Roblox game that used to post to three
 * Discord webhooks posts to three channels instead.
 */

export const MAX_CHANNELS = 20;

export const channelSlug = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9-]{0,39}$/, "Use lowercase letters, numbers and dashes, up to 40.");

export const channelsSchema = z
  .array(z.object({ slug: channelSlug, name: z.string().trim().min(1, "Name the channel.").max(60), deliverRepeats: z.boolean().optional() }))
  .max(MAX_CHANNELS, `A project can have up to ${MAX_CHANNELS} channels.`)
  .refine((list) => new Set(list.map((c) => c.slug)).size === list.length, "Two channels can't share an address.");

/** The slugs in `wanted` that aren't channels of this project. */
export const unknownChannels = (wanted: string[] | undefined, channels: ProjectChannel[]) =>
  (wanted ?? []).filter((slug) => !channels.some((c) => c.slug === slug));
