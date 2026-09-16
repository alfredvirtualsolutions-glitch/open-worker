import { env } from "../config/env.js";
import { logger } from "../logging/logger.js";
import type Sequenzy from "sequenzy";

let sequenzyClient: Sequenzy | null = null;

export function getSequenzyClient(): Sequenzy | null {
  if (!env.SEQUENZY_API_KEY) {
    logger.warn("SEQUENZY_API_KEY not set — Sequenzy integration disabled");
    return null;
  }
  if (!sequenzyClient) {
    const { default: Sequenzy } = await import("sequenzy");
    sequenzyClient = new Sequenzy({ apiKey: env.SEQUENZY_API_KEY });
  }
  return sequenzyClient;
}

export interface SendTransactionalEmailParams {
  to: string;
  slug: string;
  variables?: Record<string, unknown>;
}

export interface CreateSubscriberParams {
  email: string;
  firstName?: string;
  tags?: string[];
  customAttributes?: Record<string, unknown>;
  enrollInSequences?: boolean;
}

export interface AddTagParams {
  email: string;
  tag: string;
}

export interface TriggerEventParams {
  email: string;
  event: string;
  properties?: Record<string, unknown>;
}

export async function sendTransactionalEmail(params: SendTransactionalEmailParams): Promise<{
  success: boolean;
  data?: unknown;
  error?: string;
}> {
  const client = getSequenzyClient();
  if (!client) return { success: false, error: "Sequenzy not configured" };

  try {
    const result = await client.transactional.send(params);
    return { success: true, data: result };
  } catch (err) {
    logger.error({ err, params }, "Sequenzy transactional send failed");
    return { success: false, error: (err as Error).message };
  }
}

export async function createSubscriber(params: CreateSubscriberParams): Promise<{
  success: boolean;
  data?: unknown;
  error?: string;
}> {
  const client = getSequenzyClient();
  if (!client) return { success: false, error: "Sequenzy not configured" };

  try {
    const result = await client.subscribers.create(params);
    return { success: true, data: result };
  } catch (err) {
    logger.error({ err, params }, "Sequenzy create subscriber failed");
    return { success: false, error: (err as Error).message };
  }
}

export async function addTag(params: AddTagParams): Promise<{
  success: boolean;
  data?: unknown;
  error?: string;
}> {
  const client = getSequenzyClient();
  if (!client) return { success: false, error: "Sequenzy not configured" };

  try {
    const result = await client.subscribers.tags.add(params);
    return { success: true, data: result };
  } catch (err) {
    logger.error({ err, params }, "Sequenzy add tag failed");
    return { success: false, error: (err as Error).message };
  }
}

export async function triggerEvent(params: TriggerEventParams): Promise<{
  success: boolean;
  data?: unknown;
  error?: string;
}> {
  const client = getSequenzyClient();
  if (!client) return { success: false, error: "Sequenzy not configured" };

  try {
    const result = await client.subscribers.events.trigger(params);
    return { success: true, data: result };
  } catch (err) {
    logger.error({ err, params }, "Sequenzy trigger event failed");
    return { success: false, error: (err as Error).message };
  }
}

export async function getSubscriber(email: string): Promise<{
  success: boolean;
  data?: unknown;
  error?: string;
}> {
  const client = getSequenzyClient();
  if (!client) return { success: false, error: "Sequenzy not configured" };

  try {
    const result = await client.subscribers.get(email);
    return { success: true, data: result };
  } catch (err) {
    logger.error({ err, email }, "Sequenzy get subscriber failed");
    return { success: false, error: (err as Error).message };
  }
}

export async function listSequences(): Promise<{
  success: boolean;
  data?: unknown;
  error?: string;
}> {
  const client = getSequenzyClient();
  if (!client) return { success: false, error: "Sequenzy not configured" };

  try {
    const result = await client.sequences.list();
    return { success: true, data: result };
  } catch (err) {
    logger.error({ err }, "Sequenzy list sequences failed");
    return { success: false, error: (err as Error).message };
  }
}

export function isSequenzyConfigured(): boolean {
  return !!env.SEQUENZY_API_KEY;
}