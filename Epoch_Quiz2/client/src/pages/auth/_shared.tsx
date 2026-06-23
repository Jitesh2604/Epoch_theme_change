import React, { useState } from 'react';
import { Icon } from '../../components/ui/Icon';

// ─── Field ───────────────────────────────────────────────────────────────────
interface FieldProps {
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  icon: string;
  error?: string;
  extra?: React.ReactNode;
}

export const Field: React.FC<FieldProps> = ({ label, type, value, onChange, placeholder, icon, error, extra }) => {
  const [show, setShow] = useState(false);
  const isPassword = type === 'password';
  return (
    <div className="auth-field">
      <div className="auth-field-header">
        <label className="auth-label">{label}</label>
        {extra}
      </div>
      <div className={`auth-input-wrap ${error ? 'error' : ''}`}>
        <span className="auth-input-icon"><Icon name={icon} size={16} /></span>
        <input
          className="auth-input"
          type={isPassword && show ? 'text' : type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={isPassword ? 'current-password' : type === 'email' ? 'email' : 'name'}
        />
        {isPassword && (
          <button type="button" className="auth-eye" onClick={() => setShow(s => !s)} tabIndex={-1}>
            <Icon name={show ? 'eyeOff' : 'eye'} size={16} />
          </button>
        )}
      </div>
      {error && <span className="auth-error">{error}</span>}
    </div>
  );
};

// ─── PasswordFieldInner ───────────────────────────────────────────────────────
export const PasswordFieldInner: React.FC<{ value: string; onChange: (v: string) => void }> = ({ value, onChange }) => {
  const [show, setShow] = useState(false);
  return (
    <>
      <input className="auth-input" type={show ? 'text' : 'password'}
        value={value} onChange={e => onChange(e.target.value)}
        placeholder="Min. 8 characters" autoComplete="new-password" />
      <button type="button" className="auth-eye" onClick={() => setShow(s => !s)} tabIndex={-1}>
        <Icon name={show ? 'eyeOff' : 'eye'} size={16} />
      </button>
    </>
  );
};

// ─── AuthIllustration ─────────────────────────────────────────────────────────
export const AuthIllustration: React.FC = () => (
  <div className="auth-aside">
    <svg viewBox="0 0 420 520" fill="none" style={{ width: '100%', maxWidth: 360 }}>
      <defs>
        <linearGradient id="ag" x1="0" y1="0" x2="420" y2="520" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#354024"/>
          <stop offset="1" stopColor="#889063"/>
        </linearGradient>
      </defs>

      {/* Concentric rings — subtle warm tones */}
      <circle cx="210" cy="240" r="170" stroke="rgba(53,64,36,0.12)" strokeWidth="1.5" strokeDasharray="8 12"/>
      <circle cx="210" cy="240" r="128" stroke="rgba(136,144,99,0.15)" strokeWidth="1" strokeDasharray="4 8"/>

      {/* Central question mark circle */}
      <circle cx="210" cy="218" r="70" fill="rgba(53,64,36,0.06)" stroke="url(#ag)" strokeWidth="2"/>
      <circle cx="210" cy="218" r="52" fill="rgba(53,64,36,0.04)" stroke="rgba(53,64,36,0.15)" strokeWidth="1.5"/>
      <text x="210" y="232" textAnchor="middle" fontSize="44" fontWeight="700"
            fontFamily="Lora, Georgia, serif" fill="#354024" opacity="0.85">?</text>

      {/* Left floating card */}
      <rect x="18" y="82" width="124" height="62" rx="12" fill="rgba(245,237,224,0.90)" stroke="rgba(53,64,36,0.18)" strokeWidth="1.5"/>
      <rect x="30" y="96" width="52" height="7" rx="3.5" fill="rgba(53,64,36,0.40)"/>
      <rect x="30" y="111" width="88" height="5.5" rx="2.75" fill="rgba(53,64,36,0.15)"/>
      <rect x="30" y="123" width="70" height="5.5" rx="2.75" fill="rgba(53,64,36,0.10)"/>

      {/* Right floating card */}
      <rect x="278" y="102" width="124" height="62" rx="12" fill="rgba(245,237,224,0.90)" stroke="rgba(136,144,99,0.28)" strokeWidth="1.5"/>
      <rect x="290" y="116" width="44" height="7" rx="3.5" fill="rgba(136,144,99,0.55)"/>
      <rect x="290" y="131" width="82" height="5.5" rx="2.75" fill="rgba(53,64,36,0.12)"/>
      <rect x="290" y="143" width="64" height="5.5" rx="2.75" fill="rgba(53,64,36,0.08)"/>

      {/* Score card */}
      <rect x="28" y="356" width="136" height="50" rx="12" fill="rgba(53,64,36,0.07)" stroke="rgba(53,64,36,0.22)" strokeWidth="1.5"/>
      <text x="96" y="374" textAnchor="middle" fontSize="9" letterSpacing="1.5" fill="rgba(76,61,25,0.55)" fontFamily="Inter, sans-serif">TOP SCORE</text>
      <text x="96" y="395" textAnchor="middle" fontSize="20" fontWeight="700" fontFamily="Lora, Georgia, serif" fill="#354024">9,840</text>

      {/* Streak card */}
      <rect x="256" y="356" width="136" height="50" rx="12" fill="rgba(136,144,99,0.10)" stroke="rgba(136,144,99,0.30)" strokeWidth="1.5"/>
      <text x="324" y="374" textAnchor="middle" fontSize="9" letterSpacing="1.5" fill="rgba(76,61,25,0.50)" fontFamily="Inter, sans-serif">STREAK</text>
      <text x="324" y="395" textAnchor="middle" fontSize="20" fontWeight="700" fontFamily="Lora, Georgia, serif" fill="#889063">🔥 14</text>

      {/* Decorative dots — olive tones */}
      {([
        [48,  200, 4.5, '#354024', 0.30],
        [382, 162, 3.5, '#889063', 0.35],
        [138, 432, 3,   '#CFBB99', 0.50],
        [292, 448, 3,   '#889063', 0.30],
        [68,  318, 2.5, '#354024', 0.25],
        [368, 338, 3.5, '#CFBB99', 0.40],
        [202, 48,  2.5, '#354024', 0.35],
        [342, 58,  2,   '#889063', 0.30],
      ] as [number,number,number,string,number][]).map(([cx,cy,r,fill,op],i) => (
        <circle key={i} cx={cx} cy={cy} r={r} fill={fill} opacity={op}/>
      ))}
    </svg>

    <div className="auth-aside-text">
      <h3>Quiz. Learn. <em>Excel.</em></h3>
      <p>Join the Epoch Quiz platform — olympiad-level assessments, practice quizzes, and real leaderboards.</p>
      <div className="auth-aside-stats">
        {[['50k+','Active learners'],['200+','Quiz topics'],['3','Difficulty levels']].map(([n,l]) => (
          <div key={l} className="auth-aside-stat">
            <strong>{n}</strong><span>{l}</span>
          </div>
        ))}
      </div>
    </div>
  </div>
);

// ─── Validation helpers ───────────────────────────────────────────────────────
export function validateEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? '' : 'Enter a valid email address.';
}
export function validatePassword(v: string) {
  return v.length >= 8 ? '' : 'Password must be at least 8 characters.';
}
export function validateName(v: string) {
  return v.trim().length >= 2 ? '' : 'Name must be at least 2 characters.';
}
