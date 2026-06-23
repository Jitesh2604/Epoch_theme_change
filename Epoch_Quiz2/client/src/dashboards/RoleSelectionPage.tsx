import { useEffect } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { GraduationCap, UserCog, ArrowRight, Sparkles } from 'lucide-react';
import { getRole, setAuth, pathForRole, type Role } from './shared/auth';

const ROLES: { id: Role; label: string; desc: string; icon: any; gradient: string; border: string; iconBg: string; path: string }[] = [
  {
    id: 'teacher',
    label: 'Teacher',
    desc: 'Create assessments, upload questions, track student performance and review results.',
    icon: UserCog,
    gradient: 'from-[#EBF0E0] to-transparent dark:from-[rgba(53,64,36,0.20)] dark:to-transparent',
    border: 'border-[rgba(53,64,36,0.18)] dark:border-[rgba(106,138,68,0.25)]',
    iconBg: 'bg-[#EBF0E0] text-[#354024] dark:bg-[rgba(106,138,68,0.20)] dark:text-[#96A46A]',
    path: '/teacher',
  },
  {
    id: 'student',
    label: 'Student',
    desc: 'Take assessments, view results, climb the leaderboard and track your progress.',
    icon: GraduationCap,
    gradient: 'from-[#F7F2E8] to-transparent dark:from-[rgba(136,144,99,0.15)] dark:to-transparent',
    border: 'border-[rgba(136,144,99,0.25)] dark:border-[rgba(138,144,104,0.25)]',
    iconBg: 'bg-[#F7F2E8] text-[#6A7448] dark:bg-[rgba(138,144,104,0.18)] dark:text-[#8A9068]',
    path: '/student',
  },
];

export function RoleSelectionPage() {
  const navigate = useNavigate();
  const existing = getRole();

  useEffect(() => {
    // already signed in — never let them pick again
    if (existing) {
      window.location.href = pathForRole(existing);
    }
  }, [existing]);

  if (existing) return <Navigate to={pathForRole(existing)} replace />;

  const pick = (r: typeof ROLES[number]) => {
    setAuth({ role: r.id, signedInAt: Date.now() });
    navigate(r.path);
  };

  return (
    <div className="min-h-screen bg-bg text-fg1 flex flex-col">
      <header className="h-16 border-b border-line flex items-center px-6">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-brand grid place-items-center"><Sparkles size={16} className="text-white" /></div>
          <div>
            <div className="font-display font-semibold text-[15px] text-fg1">Epoch Quiz</div>
            <div className="text-[10px] tracking-[0.16em] uppercase text-fg3">Assessment Platform</div>
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 py-10">
        <div className="w-full max-w-5xl">
          <motion.div
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
            className="text-center mb-12"
          >
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-brand-soft border border-brand/20 text-[11px] font-semibold text-brand uppercase tracking-wider mb-4">
              <span className="w-1.5 h-1.5 rounded-full bg-brand animate-pulse-soft" />Select your role
            </div>
            <h1 className="font-display font-semibold text-[36px] md:text-[44px] tracking-tight text-fg1 leading-tight mb-3">
              How will you be using <em className="text-brand not-italic">Epoch Quiz</em> today?
            </h1>
            <p className="text-[15px] text-fg2 max-w-2xl mx-auto">
              Pick your role to enter the right workspace.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-3xl mx-auto">
            {ROLES.map((r, i) => (
              <motion.button
                key={r.id}
                onClick={() => pick(r)}
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.1 + i * 0.08 }}
                whileHover={{ y: -4 }}
                className={`group text-left relative overflow-hidden rounded-2xl border ${r.border} bg-surface1 shadow-elev1 p-7 hover:shadow-elev2 transition`}
              >
                <div className={`absolute inset-0 bg-gradient-to-br ${r.gradient} opacity-50 group-hover:opacity-100 transition`} />
                <div className="relative">
                  <div className={`w-14 h-14 rounded-2xl ${r.iconBg} border border-white/10 grid place-items-center mb-5`}>
                    <r.icon size={26} />
                  </div>
                  <h3 className="font-display font-semibold text-[22px] text-fg1 mb-2">{r.label}</h3>
                  <p className="text-[13.5px] text-fg2 leading-relaxed mb-6">{r.desc}</p>
                  <div className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-brand group-hover:gap-2.5 transition-all">
                    Enter dashboard <ArrowRight size={14} />
                  </div>
                </div>
              </motion.button>
            ))}
          </div>

          <div className="text-center mt-10 text-[12px] text-fg3">
            Publication Admin accounts are provisioned by the platform team — they're not self-serve.
          </div>

          <div className="text-center mt-2 text-[12.5px] text-fg3">
            Want to explore the public quiz site instead?{' '}
            <button onClick={() => { window.location.href = '/home'; }} className="text-brand font-semibold hover:underline">Go to homepage</button>
          </div>
        </div>
      </main>
    </div>
  );
}
