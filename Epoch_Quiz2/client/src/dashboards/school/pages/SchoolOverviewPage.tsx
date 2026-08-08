import { School, MapPin, Building2, User, Phone, Mail, Home } from 'lucide-react';
import { Card, PageHeader, Badge, Skeleton, EmptyState } from '../../shared/ui';
import { useMyProfile } from '../../../hooks/useUsers';

function Row({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 py-3 border-b border-line last:border-0">
      <div className="w-9 h-9 rounded-xl bg-surface2 border border-line grid place-items-center text-fg3 shrink-0">
        <Icon size={16} />
      </div>
      <div className="min-w-0">
        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg3">{label}</div>
        <div className="text-[14px] text-fg1 mt-0.5 break-words">{value}</div>
      </div>
    </div>
  );
}

export function SchoolOverviewPage() {
  const { data: profile, loading } = useMyProfile();
  const reg = profile?.schoolRegistration;

  return (
    <div>
      <PageHeader
        eyebrow="School Panel"
        title={reg ? reg.schoolName : (profile?.name ?? 'Overview')}
        subtitle="Your school's registration details on Epoch Quiz."
        actions={<Badge tone="success">Active</Badge>}
      />

      {loading && (
        <Card className="p-6 space-y-3">
          <Skeleton className="h-5 w-1/3" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-2/3" />
        </Card>
      )}

      {!loading && !reg && (
        <Card className="p-2">
          <EmptyState
            icon={School}
            title="No registration details found"
            desc="We couldn't find the school details linked to this account. Contact an administrator if this looks wrong."
          />
        </Card>
      )}

      {!loading && reg && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <Card className="p-5">
            <h3 className="font-display font-semibold text-[15px] text-fg1 mb-1">School</h3>
            <div>
              <Row icon={School} label="School name" value={reg.schoolName} />
              <Row icon={MapPin} label="State" value={reg.stateName} />
              <Row icon={Building2} label="Branch" value={reg.branchName} />
            </div>
          </Card>

          <Card className="p-5">
            <h3 className="font-display font-semibold text-[15px] text-fg1 mb-1">Contact</h3>
            <div>
              {reg.contactPersonName && <Row icon={User} label="Contact person" value={reg.contactPersonName} />}
              {reg.contactPhone && <Row icon={Phone} label="Phone" value={reg.contactPhone} />}
              <Row icon={Mail} label="Email" value={profile.email} />
              {(reg.address || reg.city || reg.pincode) && (
                <Row
                  icon={Home}
                  label="Address"
                  value={[reg.address, reg.city, reg.pincode].filter(Boolean).join(', ')}
                />
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
