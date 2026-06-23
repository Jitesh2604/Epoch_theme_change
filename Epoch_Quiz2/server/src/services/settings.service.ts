import { q, q1, run, newId } from '../lib/db';

export interface SettingEntry {
  key:      string;
  value:    string;
  category: string;
  label:    string;
  type:     string;
}

const DEFAULTS: SettingEntry[] = [
  { key: 'general.platformName',   value: 'Epoch Quiz',              category: 'general',    label: 'Platform name',         type: 'string'  },
  { key: 'general.supportEmail',   value: 'support@epochquiz.app',   category: 'general',    label: 'Support email',         type: 'string'  },
  { key: 'general.contactNumber',  value: '',                        category: 'general',    label: 'Contact number',        type: 'string'  },
  { key: 'general.logoUrl',        value: '',                        category: 'general',    label: 'Logo URL',              type: 'string'  },
  { key: 'security.minPasswordLength',  value: '8',   category: 'security', label: 'Minimum password length',      type: 'number'  },
  { key: 'security.maxLoginAttempts',   value: '5',   category: 'security', label: 'Max failed login attempts',    type: 'number'  },
  { key: 'security.sessionTimeoutMins', value: '60',  category: 'security', label: 'Session timeout (minutes)',    type: 'number'  },
  { key: 'security.requireEmailVerify', value: 'false', category: 'security', label: 'Require email verification', type: 'boolean' },
  { key: 'assessment.defaultDuration',   value: '30',          category: 'assessment', label: 'Default duration (minutes)', type: 'number'  },
  { key: 'assessment.defaultMarks',      value: '1',           category: 'assessment', label: 'Default marks per question', type: 'number'  },
  { key: 'assessment.showResultAfter',   value: 'IMMEDIATELY', category: 'assessment', label: 'Show result after',          type: 'string'  },
  { key: 'assessment.allowRetakes',      value: 'false',       category: 'assessment', label: 'Allow retakes',              type: 'boolean' },
  { key: 'users.teacherRegistration',  value: 'true',  category: 'users', label: 'Allow teacher self-registration', type: 'boolean' },
  { key: 'users.studentRegistration',  value: 'true',  category: 'users', label: 'Allow student self-registration', type: 'boolean' },
  { key: 'users.inviteOnly',           value: 'false', category: 'users', label: 'Invite-only mode',                type: 'boolean' },
];

export const SettingsService = {
  async getAll(): Promise<SettingEntry[]> {
    const stored = await q<SettingEntry>(
      'SELECT `key`, value, category, label, `type` FROM settings',
    );
    const storedKeys = new Set(stored.map(s => s.key));
    const missing = DEFAULTS.filter(d => !storedKeys.has(d.key));
    if (missing.length) {
      for (const d of missing) {
        await run(
          'INSERT IGNORE INTO settings (id, `key`, value, category, label, `type`, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())',
          [newId(), d.key, d.value, d.category, d.label, d.type],
        );
      }
    }
    return [...stored, ...missing].sort((a, b) => a.key.localeCompare(b.key));
  },

  async getByCategory(category: string): Promise<SettingEntry[]> {
    const all = await this.getAll();
    return all.filter(s => s.category === category);
  },

  async get(key: string): Promise<string | null> {
    try {
      const row = await q1<SettingEntry>(
        'SELECT `key`, value, category, label, `type` FROM settings WHERE `key` = ?',
        [key],
      );
      if (row) return row.value;
      return DEFAULTS.find(d => d.key === key)?.value ?? null;
    } catch {
      return DEFAULTS.find(d => d.key === key)?.value ?? null;
    }
  },

  async set(key: string, value: string): Promise<SettingEntry> {
    const def = DEFAULTS.find(d => d.key === key);
    await run(
      `INSERT INTO settings (id, \`key\`, value, category, label, \`type\`, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())
       ON DUPLICATE KEY UPDATE value = VALUES(value), updatedAt = NOW()`,
      [newId(), key, value, def?.category ?? 'general', def?.label ?? key, def?.type ?? 'string'],
    );
    return { key, value, category: def?.category ?? 'general', label: def?.label ?? key, type: def?.type ?? 'string' };
  },

  async setMany(updates: Record<string, string>): Promise<void> {
    await Promise.all(Object.entries(updates).map(([k, v]) => this.set(k, v)));
  },
};
