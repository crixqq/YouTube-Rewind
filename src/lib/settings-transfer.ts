import { type CustomProfile, type Settings } from '@/lib/settings';

export type SettingsTransferFormat = 'json' | 'txt';

export interface ParsedSettingsTransfer {
  settings: Partial<Settings>;
  configName: string;
}

const META_KEYS = new Set(['configName', 'exportedAt', 'exportKind', 'exportVersion']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseSettingsTransferText(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text);
    if (isRecord(parsed)) return parsed;
  } catch {}

  try {
    const lines = text.split('\n').filter((line) => line.includes('='));
    if (lines.length === 0) return null;
    const parsed: Record<string, unknown> = {};
    for (const line of lines) {
      const [key, ...rest] = line.split('=');
      const normalizedKey = key.trim();
      const rawValue = rest.join('=').trim();
      if (!normalizedKey) continue;
      if (rawValue === 'true') parsed[normalizedKey] = true;
      else if (rawValue === 'false') parsed[normalizedKey] = false;
      else if (!Number.isNaN(Number(rawValue)) && rawValue !== '') parsed[normalizedKey] = Number(rawValue);
      else {
        try {
          parsed[normalizedKey] = JSON.parse(rawValue);
        } catch {
          parsed[normalizedKey] = rawValue;
        }
      }
    }
    return parsed;
  } catch {
    return null;
  }
}

export function parseSettingsTransfer(text: string): ParsedSettingsTransfer | null {
  const parsed = parseSettingsTransferText(text);
  if (!parsed) return null;

  const settingsSource = isRecord(parsed.settings) ? parsed.settings : parsed;
  const configName = typeof parsed.configName === 'string' && parsed.configName.trim()
    ? parsed.configName.trim()
    : typeof settingsSource.configName === 'string' && settingsSource.configName.trim()
      ? settingsSource.configName.trim()
      : '';

  const settings: Partial<Settings> = {};
  for (const [key, value] of Object.entries(settingsSource)) {
    if (META_KEYS.has(key)) continue;
    (settings as Record<string, unknown>)[key] = value;
  }

  return {
    settings,
    configName,
  };
}

function serializeTransferValue(value: unknown): string {
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

export function stringifySettingsTransfer(payload: Record<string, unknown>, format: SettingsTransferFormat): string {
  if (format === 'json') {
    return JSON.stringify(payload, null, 2);
  }
  return Object.entries(payload)
    .map(([key, value]) => `${key} = ${serializeTransferValue(value)}`)
    .join('\n');
}

function createTransferBase(configName: string, exportKind: 'settings' | 'profile'): Record<string, unknown> {
  return {
    configName: configName.trim(),
    exportedAt: new Date().toISOString(),
    exportKind,
  };
}

export function createSettingsExportPayload(settings: Settings, configName: string): Record<string, unknown> {
  const { language: _, ...exportData } = settings;
  return {
    ...createTransferBase(configName, 'settings'),
    ...exportData,
  };
}

export function createProfileExportPayload(profile: CustomProfile): Record<string, unknown> {
  return {
    ...createTransferBase(profile.name, 'profile'),
    ...profile.settings,
  };
}
