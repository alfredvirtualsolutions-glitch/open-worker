import { env } from "../config/env.js";
import { logger } from "../logging/logger.js";

const BUNNY_API_BASE = "https://api.bunny.net";
const BUNNY_STORAGE_BASE = "https://storage.bunnycdn.com";

export interface BunnyClientConfig {
  apiKey: string;
  storageZone?: string;
  cdnHostname?: string;
}

function getConfig(): BunnyClientConfig | null {
  if (!env.BUNNY_API_KEY) {
    logger.warn("BUNNY_API_KEY not set — bunny.net integration disabled");
    return null;
  }
  return {
    apiKey: env.BUNNY_API_KEY,
    storageZone: env.BUNNY_STORAGE_ZONE,
    cdnHostname: env.BUNNY_CDN_HOSTNAME,
  };
}

export async function purgeCDNCache(url: string): Promise<{
  success: boolean;
  data?: unknown;
  error?: string;
}> {
  const config = getConfig();
  if (!config) return { success: false, error: "bunny.net not configured" };

  try {
    const response = await fetch(`${BUNNY_API_BASE}/cdn/purge`, {
      method: "POST",
      headers: {
        "Access-Key": config.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url }),
    });
    if (!response.ok) {
      throw new Error(`bunny.net CDN purge failed: ${response.status} ${response.statusText}`);
    }
    const data = await response.json();
    return { success: true, data };
  } catch (err) {
    logger.error({ err, url }, "bunny.net CDN purge failed");
    return { success: false, error: (err as Error).message };
  }
}

export async function uploadFile(
  storageZone: string,
  path: string,
  content: Buffer | string,
  contentType = "application/octet-stream"
): Promise<{
  success: boolean;
  data?: unknown;
  error?: string;
}> {
  const config = getConfig();
  if (!config) return { success: false, error: "bunny.net not configured" };

  const zone = storageZone || config.storageZone;
  if (!zone) {
    return { success: false, error: "bunny.net storage zone not configured" };
  }

  try {
    const response = await fetch(
      `${BUNNY_STORAGE_BASE}/${zone}/${path}`,
      {
        method: "PUT",
        headers: {
          "Access-Key": config.apiKey,
          "Content-Type": contentType,
        },
        body: content,
      }
    );
    if (!response.ok) {
      throw new Error(`bunny.net storage upload failed: ${response.status} ${response.statusText}`);
    }
    return { success: true, data: { path, storageZone: zone } };
  } catch (err) {
    logger.error({ err, path, storageZone: zone }, "bunny.net storage upload failed");
    return { success: false, error: (err as Error).message };
  }
}

export async function deleteFile(
  storageZone: string,
  path: string
): Promise<{
  success: boolean;
  error?: string;
}> {
  const config = getConfig();
  if (!config) return { success: false, error: "bunny.net not configured" };

  const zone = storageZone || config.storageZone;
  if (!zone) {
    return { success: false, error: "bunny.net storage zone not configured" };
  }

  try {
    const response = await fetch(
      `${BUNNY_STORAGE_BASE}/${zone}/${path}`,
      {
        method: "DELETE",
        headers: {
          "Access-Key": config.apiKey,
        },
      }
    );
    if (!response.ok && response.status !== 404) {
      throw new Error(`bunny.net storage delete failed: ${response.status} ${response.statusText}`);
    }
    return { success: true };
  } catch (err) {
    logger.error({ err, path, storageZone: zone }, "bunny.net storage delete failed");
    return { success: false, error: (err as Error).message };
  }
}

export async function listStorageFiles(
  storageZone: string,
  path = "/"
): Promise<{
  success: boolean;
  data?: unknown;
  error?: string;
}> {
  const config = getConfig();
  if (!config) return { success: false, error: "bunny.net not configured" };

  const zone = storageZone || config.storageZone;
  if (!zone) {
    return { success: false, error: "bunny.net storage zone not configured" };
  }

  try {
    const response = await fetch(
      `${BUNNY_STORAGE_BASE}/${zone}/${path}`,
      {
        method: "GET",
        headers: {
          "Access-Key": config.apiKey,
        },
      }
    );
    if (!response.ok) {
      throw new Error(`bunny.net storage list failed: ${response.status} ${response.statusText}`);
    }
    const data = await response.json();
    return { success: true, data };
  } catch (err) {
    logger.error({ err, path, storageZone: zone }, "bunny.net storage list failed");
    return { success: false, error: (err as Error).message };
  }
}

export async function pushVideo(
  libraryId: string,
  videoFile: Buffer | string,
  title: string,
  collectionId?: string
): Promise<{
  success: boolean;
  data?: unknown;
  error?: string;
}> {
  const config = getConfig();
  if (!config) return { success: false, error: "bunny.net not configured" };

  try {
    const createResponse = await fetch(
      `${BUNNY_API_BASE}/video/libraries/${libraryId}/videos`,
      {
        method: "POST",
        headers: {
          "Access-Key": config.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title, collectionId }),
      }
    );
    if (!createResponse.ok) {
      throw new Error(`bunny.net stream create failed: ${createResponse.status}`);
    }
    const createData = await createResponse.json();
    return { success: true, data: createData };
  } catch (err) {
    logger.error({ err, title, libraryId }, "bunny.net stream push failed");
    return { success: false, error: (err as Error).message };
  }
}

export async function purgePullZone(
  pullZoneId: string
): Promise<{
  success: boolean;
  data?: unknown;
  error?: string;
}> {
  const config = getConfig();
  if (!config) return { success: false, error: "bunny.net not configured" };

  try {
    const response = await fetch(
      `${BUNNY_API_BASE}/pullzone/${pullZoneId}/purge`,
      {
        method: "POST",
        headers: {
          "Access-Key": config.apiKey,
          "Content-Type": "application/json",
        },
      }
    );
    if (!response.ok) {
      throw new Error(`bunny.net pull zone purge failed: ${response.status}`);
    }
    const data = await response.json();
    return { success: true, data };
  } catch (err) {
    logger.error({ err, pullZoneId }, "bunny.net pull zone purge failed");
    return { success: false, error: (err as Error).message };
  }
}

export function isBunnyConfigured(): boolean {
  return !!env.BUNNY_API_KEY;
}