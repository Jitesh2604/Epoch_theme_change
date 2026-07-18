import { prisma } from '../lib/prisma';
import { ApiError } from '../utils/ApiError';

export interface SettingEntry {
  key:      string;
  value:    string;
  category: string;
  label:    string;
  type:     string;
}

interface SettingDefault extends SettingEntry {
  /**
   * Whether this setting is actually read and enforced somewhere in the
   * app. Defaults to true. Set false for a setting that is planned but not
   * yet wired up — it stays fully readable/writable via get()/set() (so
   * enforcement code can be built and staged against it) but is filtered
   * out of getAll()/getByCategory(), which back the Admin Settings page, so
   * it can't be shown to admins with no actual effect. Flip back to true in
   * the same commit that adds the real enforcement.
   */
  visible?: boolean;
}

const DEFAULTS: SettingDefault[] = [
  { key: 'general.platformName',   value: 'Epoch Quiz',              category: 'general',    label: 'Platform name',         type: 'string'  },
  // Not consumed anywhere yet (no public branding endpoint, no client
  // wiring) — hidden until a real consumer exists.
  { key: 'general.supportEmail',   value: 'support@epochquiz.app',   category: 'general',    label: 'Support email',         type: 'string', visible: false },
  { key: 'general.contactNumber',  value: '',                        category: 'general',    label: 'Contact number',        type: 'string', visible: false },
  { key: 'general.logoUrl',        value: '',                        category: 'general',    label: 'Logo URL',              type: 'string', visible: false },
  { key: 'security.minPasswordLength',  value: '8',   category: 'security', label: 'Minimum password length',      type: 'number'  },
  // Needs a failed-attempt/lockout tracking mechanism that doesn't exist yet.
  { key: 'security.maxLoginAttempts',   value: '5',   category: 'security', label: 'Max failed login attempts',    type: 'number', visible: false },
  // Ambiguous as a fixed token-expiry vs. an idle-timeout, and no idle
  // tracking exists — hidden until the real behaviour is decided and built.
  { key: 'security.sessionTimeoutMins', value: '60',  category: 'security', label: 'Session timeout (minutes)',    type: 'number', visible: false },
  // No email-verification flow exists at all (no token, no endpoint, no
  // emailVerified field) — hidden until that feature is built.
  { key: 'security.requireEmailVerify', value: 'false', category: 'security', label: 'Require email verification', type: 'boolean', visible: false },
  { key: 'assessment.defaultDuration',   value: '30',          category: 'assessment', label: 'Default duration (minutes)', type: 'number'  },
  { key: 'assessment.defaultMarks',      value: '1',           category: 'assessment', label: 'Default marks per question', type: 'number'  },
  // AFTER_END_DATE is buildable (Assessment.endDatetime exists), but
  // MANUALLY has no "release results" action anywhere — hidden until all
  // three states are real, not just the default IMMEDIATELY one.
  { key: 'assessment.showResultAfter',   value: 'IMMEDIATELY', category: 'assessment', label: 'Show result after',          type: 'string', visible: false },
  // Submission has a hard one-row-per-(assessment,student) unique
  // constraint — real retakes need attempt-numbering, a schema change.
  { key: 'assessment.allowRetakes',      value: 'false',       category: 'assessment', label: 'Allow retakes',              type: 'boolean', visible: false },
  { key: 'users.studentRegistration',  value: 'true',  category: 'users', label: 'Allow student self-registration', type: 'boolean' },
  // Needs an invite-token system that doesn't exist yet.
  { key: 'users.inviteOnly',           value: 'false', category: 'users', label: 'Invite-only mode',                type: 'boolean', visible: false },
];

export const SettingsService = {
  async getAll(): Promise<SettingEntry[]> {
    const stored = await prisma.setting.findMany({
      select: { key: true, value: true, category: true, label: true, type: true },
    });
    const storedKeys = new Set(stored.map(s => s.key));
    const missing = DEFAULTS.filter(d => !storedKeys.has(d.key));
    if (missing.length) {
      await prisma.setting.createMany({
        data: missing.map(({ visible: _visible, ...rest }) => rest),
        skipDuplicates: true,
      });
    }
    const merged = [...stored, ...missing].sort((a, b) => a.key.localeCompare(b.key));
    const isVisible = new Map(DEFAULTS.map(d => [d.key, d.visible ?? true]));
    return merged.filter(s => isVisible.get(s.key) ?? true);
  },

  async getByCategory(category: string): Promise<SettingEntry[]> {
    const all = await this.getAll();
    return all.filter(s => s.category === category);
  },

  async get(key: string): Promise<string | null> {
    try {
      const row = await prisma.setting.findUnique({ where: { key }, select: { value: true } });
      if (row) return row.value;
      return DEFAULTS.find(d => d.key === key)?.value ?? null;
    } catch {
      return DEFAULTS.find(d => d.key === key)?.value ?? null;
    }
  },

  async set(key: string, value: string): Promise<SettingEntry> {
    const def = DEFAULTS.find(d => d.key === key);
    const category = def?.category ?? 'general';
    const label    = def?.label ?? key;
    const type     = def?.type ?? 'string';
    await prisma.setting.upsert({
      where:  { key },
      create: { key, value, category, label, type },
      update: { value },
    });
    return { key, value, category, label, type };
  },

  async setMany(updates: Record<string, string>): Promise<void> {
    await Promise.all(Object.entries(updates).map(([k, v]) => this.set(k, v)));
  },
};

/**
 * Enforce the live security.minPasswordLength admin setting. The zod schemas
 * on the password fields already enforce an absolute floor of 8 chars
 * (validate middleware runs before any service code, so it can't read a DB
 * setting) — this adds the admin-configurable, possibly-stricter bound on
 * top of it. Call from every path that accepts a new password.
 */
export async function assertMinPasswordLength(password: string): Promise<void> {
  const raw = await SettingsService.get('security.minPasswordLength');
  const min = Number(raw) || 8;
  if (password.length < min) {
    throw ApiError.badRequest(`Password must be at least ${min} characters`);
  }
}
