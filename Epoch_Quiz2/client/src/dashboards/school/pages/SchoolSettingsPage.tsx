import { useEffect, useState } from 'react';
import { School, MapPin, Building2, User, Phone, Mail, Home, KeyRound, Save } from 'lucide-react';
import { useMyProfile, userApi } from '../../../hooks/useUsers';
import {
  SchoolCard, SchoolPageHeading, SchoolButton, SchoolSkeleton, SchoolInput, SchoolLabel, useSchoolToasts,
} from '../schoolUI';

function InfoRow({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 py-3 border-b border-[var(--sp-border)] last:border-0">
      <div className="w-9 h-9 rounded-xl bg-[var(--sp-surface-alt)] border border-[var(--sp-border)] grid place-items-center text-[var(--sp-muted)] shrink-0">
        <Icon size={16} />
      </div>
      <div className="min-w-0">
        <div className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-[var(--sp-muted)]">{label}</div>
        <div className="text-[14px] font-semibold text-[var(--sp-text)] mt-0.5 break-words">{value}</div>
      </div>
    </div>
  );
}

/** Self-service settings, built entirely on GET/PATCH /users/me and
 *  PATCH /users/me/password — generic, role-agnostic endpoints already
 *  fully implemented server-side (see useUsers.ts) but never consumed by
 *  any Profile/Settings screen until now. School identity (name/state/
 *  branch/registration contact) is read-only here — there is no existing
 *  "edit school registration" endpoint, so nothing here fakes one; the
 *  School's own name/branch data is managed via Branch Management instead. */
export function SchoolSettingsPage() {
  const { data: profile, loading, refetch } = useMyProfile();
  const { push, node } = useSchoolToasts();
  const reg = profile?.schoolRegistration;

  const [name, setName] = useState('');
  const [savingName, setSavingName] = useState(false);
  useEffect(() => { if (profile) setName(profile.name); }, [profile]);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwError, setPwError] = useState<string | null>(null);
  const [changingPw, setChangingPw] = useState(false);

  const saveName = async () => {
    if (!name.trim() || name.trim() === profile?.name) return;
    setSavingName(true);
    try {
      await userApi.updateMe({ name: name.trim() });
      push({ kind: 'success', title: 'Name updated' });
      refetch();
    } catch (e: any) {
      push({ kind: 'danger', title: 'Could not update name', sub: e?.message });
    } finally {
      setSavingName(false);
    }
  };

  const submitPasswordChange = async () => {
    setPwError(null);
    if (!currentPassword) { setPwError('Enter your current password.'); return; }
    if (newPassword.length < 8) { setPwError('New password must be at least 8 characters.'); return; }
    if (newPassword !== confirmPassword) { setPwError('New passwords do not match.'); return; }
    setChangingPw(true);
    try {
      await userApi.changePassword({ currentPassword, newPassword });
      push({ kind: 'success', title: 'Password changed' });
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
    } catch (e: any) {
      setPwError(e?.message ?? 'Could not change password.');
    } finally {
      setChangingPw(false);
    }
  };

  return (
    <div>
      {node}
      <SchoolPageHeading title="School Settings" subtitle="Your account and school registration details." />

      {loading ? (
        <SchoolCard className="space-y-3"><SchoolSkeleton className="h-5 w-1/3" /><SchoolSkeleton className="h-4 w-1/2" /><SchoolSkeleton className="h-4 w-2/3" /></SchoolCard>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <SchoolCard>
            <h3 className="font-body font-extrabold text-[15px] text-[var(--sp-text)] mb-1">Your Account</h3>
            <div className="mb-2">
              <InfoRow icon={Mail} label="Email" value={profile?.email ?? '—'} />
            </div>
            <div className="mt-3">
              <SchoolLabel>Display name</SchoolLabel>
              <div className="flex gap-2">
                <SchoolInput value={name} onChange={e => setName(e.target.value)} className="flex-1" />
                <SchoolButton size="sm" icon={Save} disabled={savingName || !name.trim() || name.trim() === profile?.name} onClick={saveName}>
                  {savingName ? 'Saving…' : 'Save'}
                </SchoolButton>
              </div>
            </div>

            <h3 className="font-body font-extrabold text-[15px] text-[var(--sp-text)] mt-6 mb-3 flex items-center gap-1.5"><KeyRound size={14} /> Change Password</h3>
            <div className="space-y-3">
              <SchoolInput type="password" placeholder="Current password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} />
              <SchoolInput type="password" placeholder="New password (min. 8 characters)" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
              <SchoolInput type="password" placeholder="Confirm new password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
              {pwError && <p className="text-[12px] font-semibold text-[var(--sp-danger)]">{pwError}</p>}
              <SchoolButton size="sm" variant="secondary" disabled={changingPw} onClick={submitPasswordChange}>
                {changingPw ? 'Changing…' : 'Change Password'}
              </SchoolButton>
            </div>
          </SchoolCard>

          <SchoolCard>
            <h3 className="font-body font-extrabold text-[15px] text-[var(--sp-text)] mb-1">School Registration</h3>
            {reg ? (
              <div>
                <InfoRow icon={School} label="School name" value={reg.schoolName} />
                <InfoRow icon={MapPin} label="State" value={reg.stateName} />
                <InfoRow icon={Building2} label="Primary branch" value={reg.branchName} />
                {reg.contactPersonName && <InfoRow icon={User} label="Contact person" value={reg.contactPersonName} />}
                {reg.contactPhone && <InfoRow icon={Phone} label="Phone" value={reg.contactPhone} />}
                {(reg.address || reg.city || reg.pincode) && (
                  <InfoRow icon={Home} label="Address" value={[reg.address, reg.city, reg.pincode].filter(Boolean).join(', ')} />
                )}
                <p className="text-[11.5px] font-semibold text-[var(--sp-muted-2)] mt-3 pt-3 border-t border-[var(--sp-border)]">
                  To manage additional branches, visit Branch Management. School registration details aren't self-editable yet.
                </p>
              </div>
            ) : (
              <p className="text-[12.5px] text-[var(--sp-muted)]">No school registration found for this account.</p>
            )}
          </SchoolCard>
        </div>
      )}
    </div>
  );
}
