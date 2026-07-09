/* eslint-disable */
import { useState, useEffect } from 'react';
import { Globe, Shield, ClipboardList, Users, Save, RefreshCw } from 'lucide-react';
import { PageHeader, Card, Button, Skeleton } from '../../shared/ui';
import { useSettings, settingsApi } from '../../../hooks/useSettings';
import type { Setting } from '../../../hooks/useSettings';
import { useToasts } from '../../shared/ui';

type Category = 'general' | 'security' | 'assessment' | 'users';

const TABS_CFG: { key: Category; label: string; icon: any }[] = [
  { key: 'general',    label: 'General',    icon: Globe         },
  { key: 'security',   label: 'Security',   icon: Shield        },
  { key: 'assessment', label: 'Assessment', icon: ClipboardList },
  { key: 'users',      label: 'Users',      icon: Users         },
];

function SettingField({ setting, value, onChange }: { setting: Setting; value: string; onChange: (v: string) => void }) {
  const base = 'w-full h-10 px-3 rounded-xl bg-surface1 border border-line text-[13px] text-fg1 focus:outline-none focus:border-brand/40';
  if (setting.type === 'boolean') {
    return (
      <label className='flex items-center gap-3 cursor-pointer select-none'>
        <div className={`relative w-11 h-6 rounded-full transition-colors ${value === 'true' ? 'bg-brand' : 'bg-surface2 border border-line'}`} onClick={() => onChange(value === 'true' ? 'false' : 'true')}>
          <div className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${value === 'true' ? 'translate-x-5' : ''}`} />
        </div>
        <span className='text-[13px] text-fg2'>{value === 'true' ? 'Enabled' : 'Disabled'}</span>
      </label>
    );
  }
  if (setting.key === 'assessment.showResultAfter') {
    return (
      <select value={value} onChange={e => onChange(e.target.value)} className={base}>
        <option value='IMMEDIATELY'>Immediately after submission</option>
        <option value='AFTER_END_DATE'>After end date</option>
        <option value='MANUALLY'>Manually by teacher</option>
      </select>
    );
  }
  return <input type={setting.type === 'number' ? 'number' : setting.key.includes('email') ? 'email' : 'text'} value={value} onChange={e => onChange(e.target.value)} className={base} min={setting.type === 'number' ? 0 : undefined} />;
}

export function SettingsPage() {
  const [tab, setTab] = useState<Category>('general');
  const { data: settings, loading, error, refetch } = useSettings();
  const { push, node } = useToasts();
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (settings) {
      const map: Record<string, string> = {};
      (settings as Setting[]).forEach(s => { map[s.key] = s.value; });
      setValues(map);
      setDirty(false);
    }
  }, [settings]);

  const handleChange = (key: string, value: string) => { setValues(v => ({ ...v, [key]: value })); setDirty(true); };

  const handleSave = async () => {
    setSaving(true);
    try {
      await settingsApi.updateMany(values);
      push({ kind: 'success', title: 'Settings saved' });
      setDirty(false);
      refetch();
    } catch (e: any) {
      push({ kind: 'danger', title: 'Save failed', sub: e.message });
    } finally { setSaving(false); }
  };

  const tabSettings = ((settings ?? []) as Setting[]).filter(s => s.category === tab);

  return (
    <>
      {node}
      <PageHeader
        eyebrow='Admin · Configuration'
        title='Platform Settings'
        subtitle='Configure platform behaviour, security, and registration policies.'
        actions={<div className='flex gap-2'>
          <Button variant='ghost' icon={RefreshCw} onClick={refetch} disabled={loading}>Refresh</Button>
          <Button icon={Save} onClick={handleSave} disabled={saving || !dirty}>{saving ? 'Saving…' : 'Save changes'}</Button>
        </div>}
      />
      {error && <Card className='p-4 mb-4'><p className='text-danger text-[13px]'>{error}</p></Card>}
      <div className='flex gap-1 mb-6 p-1 bg-surface1/50 rounded-xl w-fit max-w-full overflow-x-auto border border-line no-scrollbar'>
        {TABS_CFG.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-semibold transition shrink-0 whitespace-nowrap ${tab === t.key ? 'bg-brand text-brand-ink shadow-elev1' : 'text-fg2 hover:text-fg1'}`}>
            <t.icon size={14} />{t.label}
          </button>
        ))}
      </div>
      <Card className='p-6'>
        {loading ? (
          <div className='space-y-6'>{Array.from({ length: 4 }).map((_, i) => <div key={i} className='space-y-2'><Skeleton className='h-4 w-40 rounded' /><Skeleton className='h-10 rounded-xl' /></div>)}</div>
        ) : tabSettings.length === 0 ? (
          <div className='text-center py-12 text-fg3 text-[13px]'>No settings in this category.</div>
        ) : (
          <div className='grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6'>
            {tabSettings.map(s => (
              <div key={s.key}>
                <label className='block text-[12px] font-semibold text-fg2 mb-1.5 uppercase tracking-wider'>{s.label}</label>
                <SettingField setting={s} value={values[s.key] ?? s.value} onChange={v => handleChange(s.key, v)} />
                <p className='text-[11px] text-fg4 mt-1 font-mono'>{s.key}</p>
              </div>
            ))}
          </div>
        )}
      </Card>
      {dirty && (
        <div className='fixed bottom-6 right-6 z-50'>
          <div className='flex items-center gap-3 px-5 py-3.5 bg-surface1 border border-brand/30 rounded-2xl shadow-elev2'>
            <span className='text-[13px] text-fg1 font-medium'>Unsaved changes</span>
            <Button size='sm' onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save now'}</Button>
          </div>
        </div>
      )}
    </>
  );
}
