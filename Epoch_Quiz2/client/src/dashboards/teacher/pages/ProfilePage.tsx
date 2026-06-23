import { useState, useEffect } from 'react';
import {
  Mail, BookOpen, Edit3, Save, X, Calendar,
  Building, MapPin, User, Phone, FileText, Clock, Award, KeyRound,
} from 'lucide-react';
import { PageHeader, Card, Button, Badge, StatCard, Avatar, Skeleton } from '../../shared/ui';
import { loadUser } from '../../../lib/authStore';
import { userApi, useMyProfile } from '../../../hooks/useUsers';
import { useMyStats } from '../../../hooks/useLeaderboard';
import { useToasts } from '../../shared/ui';

function formatDate(iso?: string | Date | null) {
  if (!iso) return '—';
  try { return new Date(iso as string).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }); }
  catch { return '—'; }
}

function capitalize(s?: string) {
  if (!s) return '—';
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

export function ProfilePage() {
  const cachedUser = loadUser();
  const { data: profile, loading, error, refetch } = useMyProfile();
  const { data: statsData } = useMyStats();
  const stats = statsData as any;
  const { push, node } = useToasts();

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [schoolName, setSchoolName] = useState('');
  const [bio, setBio] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile) {
      setName(profile.name ?? '');
      setSchoolName(profile.teacherProfile?.schoolName ?? '');
      setBio(profile.teacherProfile?.bio ?? '');
    } else if (cachedUser) {
      setName(cachedUser.name ?? '');
    }
  }, [profile]);

  const save = async () => {
    setSaving(true);
    try {
      await userApi.updateMe({ name, schoolName: schoolName || undefined, bio: bio || undefined });
      push({ kind: 'success', title: 'Profile updated' });
      setEditing(false);
      refetch();
    } catch (e: any) {
      push({ kind: 'danger', title: 'Failed', sub: e.message });
    } finally {
      setSaving(false);
    }
  };

  const displayName  = profile?.name  ?? cachedUser?.name  ?? 'Teacher';
  const displayEmail = profile?.email ?? cachedUser?.email ?? '—';
  const hue          = profile?.avatarHue ?? cachedUser?.avatarHue ?? 180;
  const tp           = profile?.teacherProfile;

  return (
    <>
      {node}
      <PageHeader
        eyebrow="Account"
        title="My Profile"
        subtitle="Your personal information and account details."
        actions={
          editing
            ? <>
                <Button variant="ghost" icon={X} onClick={() => setEditing(false)}>Cancel</Button>
                <Button icon={Save} onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</Button>
              </>
            : <Button variant="soft" icon={Edit3} onClick={() => setEditing(true)}>Edit profile</Button>
        }
      />

      {error && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-danger/10 border border-danger/20 text-[13px] text-danger">
          Could not load full profile — showing cached data. {error}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[380px_1fr] gap-5">
        {/* ── Left: Identity card ─────────────────────────────────── */}
        <Card className="p-6">
          <div className="flex flex-col items-center text-center">
            {loading
              ? <Skeleton className="w-24 h-24 rounded-full" />
              : <Avatar name={displayName} hue={hue} size={96} />
            }

            {editing ? (
              <div className="w-full space-y-3 text-left mt-5">
                <div>
                  <label className="text-[11px] text-fg3 block mb-1">Full name</label>
                  <input value={name} onChange={e => setName(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl bg-surface1 border border-line text-[13px] text-fg1 focus:outline-none focus:border-brand/40" />
                </div>
                <div>
                  <label className="text-[11px] text-fg3 block mb-1">School / Institution</label>
                  <input value={schoolName} onChange={e => setSchoolName(e.target.value)}
                    placeholder="Optional"
                    className="w-full h-10 px-3 rounded-xl bg-surface1 border border-line text-[13px] text-fg1 focus:outline-none focus:border-brand/40" />
                </div>
                <div>
                  <label className="text-[11px] text-fg3 block mb-1">Bio</label>
                  <textarea value={bio} onChange={e => setBio(e.target.value)} rows={3}
                    placeholder="A short bio…"
                    className="w-full px-3 py-2.5 rounded-xl bg-surface1 border border-line text-[13px] text-fg1 focus:outline-none focus:border-brand/40 resize-none" />
                </div>
              </div>
            ) : (
              <>
                {loading ? (
                  <div className="w-full mt-4 space-y-2">
                    <Skeleton className="h-6 w-3/4 mx-auto rounded" />
                    <Skeleton className="h-4 w-1/2 mx-auto rounded" />
                  </div>
                ) : (
                  <>
                    <h2 className="font-display font-semibold text-[22px] text-fg1 mt-4">{displayName}</h2>
                    <p className="text-[13px] text-fg3 mt-0.5">{displayEmail}</p>
                    <div className="flex justify-center gap-2 mt-3">
                      <Badge tone="brand">Teacher</Badge>
                      {profile?.profileComplete && <Badge tone="success">Verified</Badge>}
                    </div>
                    {tp?.bio && (
                      <p className="text-[12.5px] text-fg2 mt-4 text-left leading-relaxed">{tp.bio}</p>
                    )}
                  </>
                )}

                <div className="w-full mt-6 pt-6 border-t border-line space-y-3 text-left">
                  {loading
                    ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 rounded-xl" />)
                    : (
                      <>
                        <InfoRow icon={Mail}     label="Email"                value={displayEmail} />
                        <InfoRow icon={BookOpen} label="Role"                 value={capitalize(profile?.role ?? cachedUser?.role)} />
                        {tp?.schoolName   && <InfoRow icon={Building}  label="School / Institution" value={tp.schoolName} />}
                        {tp?.teacherCode  && <InfoRow icon={KeyRound}  label="Your teacher code"    value={tp.teacherCode} />}
                        {profile?.mobileNo && <InfoRow icon={Phone}    label="Phone"                value={profile.mobileNo} />}
                        {tp?.mobileNo && !profile?.mobileNo && <InfoRow icon={Phone} label="Phone"  value={tp.mobileNo} />}
                        {tp?.dob          && <InfoRow icon={Calendar}  label="Date of birth"        value={formatDate(tp.dob)} />}
                        {(tp?.city || tp?.state || tp?.country) && (
                          <InfoRow icon={MapPin} label="Location"
                            value={[tp?.city, tp?.state, tp?.country].filter(Boolean).join(', ')} />
                        )}
                      </>
                    )
                  }
                </div>
              </>
            )}
          </div>
        </Card>

        {/* ── Right: Stats + account details ──────────────────────── */}
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard label="Assessments created" value={stats?.assessmentsCreated ?? 0}           icon={FileText} tone="brand"  />
            <StatCard label="Total submissions"    value={stats?.totalSubmissions    ?? 0}          icon={Award}    tone="violet" />
            <StatCard label="Avg score"            value={`${Math.round(stats?.avgPercent ?? 0)}%`} icon={Edit3}    tone="amber"  />
          </div>

          <Card className="p-6">
            <h3 className="font-display font-semibold text-[15px] text-fg1 mb-4">Account details</h3>
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-xl" />)}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <DetailItem icon={User}     label="Full name"      value={displayName} />
                <DetailItem icon={Mail}     label="Email address"  value={displayEmail} />
                <DetailItem icon={Award}    label="Account status" value={capitalize(profile?.status ?? cachedUser?.status)} />
                <DetailItem icon={Calendar} label="Member since"   value={formatDate(profile?.createdAt ?? cachedUser?.createdAt)} />
                {profile?.updatedAt && (
                  <DetailItem icon={Clock}  label="Last updated"   value={formatDate(profile.updatedAt)} />
                )}
              </div>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-9 h-9 rounded-lg bg-surface1 border border-line grid place-items-center text-fg3 shrink-0">
        <Icon size={15} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[10.5px] text-fg3 uppercase tracking-wider">{label}</div>
        <div className="text-[13px] text-fg1 font-medium truncate">{value}</div>
      </div>
    </div>
  );
}

function DetailItem({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-xl bg-surface1 border border-line">
      <div className="w-8 h-8 rounded-lg bg-surface2 border border-line grid place-items-center text-fg3 shrink-0 mt-0.5">
        <Icon size={14} />
      </div>
      <div className="min-w-0">
        <div className="text-[10.5px] text-fg3 uppercase tracking-wider">{label}</div>
        <div className="text-[13px] text-fg1 font-medium mt-0.5">{value}</div>
      </div>
    </div>
  );
}
