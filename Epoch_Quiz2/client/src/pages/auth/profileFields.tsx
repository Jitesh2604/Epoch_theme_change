import React, { useState, useEffect } from 'react';
import { Icon } from '../../components/ui/Icon';
import { showToast } from '../../components/ui/Toast';
import type { CatalogItem } from '../../hooks/useCatalog';
import { EDUCATION_BOARD_OPTIONS, suggestStateBoard } from '../../lib/educationBoards';

// ── Resize a picked image file to a compact JPEG data URL ──────────
export function fileToResizedDataUrl(file: File, max = 512): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('Canvas not supported')); return; }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = () => reject(new Error('Invalid image file'));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.readAsDataURL(file);
  });
}

// ── Section heading ───────────────────────────────────────────────
export const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="auth-section">
    <p className="auth-section-title">{title}</p>
    {children}
  </div>
);

// ── Simple text / date field ──────────────────────────────────────
interface FieldProps {
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  icon: string;
  hint?: string;
  optional?: boolean;
  readOnly?: boolean;
  error?: string;
}

export const ProfileField: React.FC<FieldProps> = ({
  label, type = 'text', value, onChange, placeholder, icon, hint, optional, readOnly, error,
}) => (
  <div className="auth-field">
    <div className="auth-field-header">
      <label className="auth-label">
        {label}
        {optional && <span className="auth-optional"> (optional)</span>}
      </label>
    </div>
    <div className={`auth-input-wrap ${error ? 'error' : ''}`} style={readOnly ? { opacity: 0.7 } : undefined}>
      <span className="auth-input-icon"><Icon name={icon} size={16} /></span>
      <input
        className="auth-input"
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder ?? ''}
        readOnly={readOnly}
        style={readOnly ? { cursor: 'default' } : undefined}
      />
    </div>
    {error
      ? <span className="auth-error">{error}</span>
      : hint && <span className="auth-hint">{hint}</span>}
  </div>
);

// ── Select field ──────────────────────────────────────────────────
interface SelectFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  icon: string;
  optional?: boolean;
  placeholder?: string;
  error?: string;
  hint?: string;
}

export const SelectField: React.FC<SelectFieldProps> = ({
  label, value, onChange, options, icon, optional, placeholder, error, hint,
}) => (
  <div className="auth-field">
    <div className="auth-field-header">
      <label className="auth-label">
        {label}
        {optional && <span className="auth-optional"> (optional)</span>}
      </label>
    </div>
    <div className={`auth-input-wrap ${error ? 'error' : ''}`} style={{ position: 'relative' }}>
      <span className="auth-input-icon"><Icon name={icon} size={16} /></span>
      <select
        className="auth-input"
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{ appearance: 'none', WebkitAppearance: 'none', paddingRight: 32, cursor: 'pointer' }}
      >
        <option value="">{placeholder ?? '— Select —'}</option>
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      {/* Custom dropdown arrow */}
      <span style={{
        position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
        pointerEvents: 'none', color: 'var(--fg-3)',
        display: 'flex', alignItems: 'center',
      }}>
        <Icon name="chevronDown" size={15} />
      </span>
    </div>
    {error
      ? <span className="auth-error">{error}</span>
      : hint && <span className="auth-hint">{hint}</span>}
  </div>
);

// ── Multi-checkbox ────────────────────────────────────────────────
export function MultiCheckbox({
  label,
  items,
  selected,
  onChange,
  optional,
  error,
}: {
  label: string;
  items: CatalogItem[];
  selected: string[];
  onChange: (ids: string[]) => void;
  optional?: boolean;
  error?: string;
}) {
  const toggle = (id: string) => {
    if (selected.includes(id)) onChange(selected.filter(x => x !== id));
    else onChange([...selected, id]);
  };

  return (
    <div className="auth-field">
      <div className="auth-field-header">
        <label className="auth-label">
          {label}
          {optional && <span className="auth-optional"> (optional)</span>}
        </label>
        {selected.length > 0 && (
          <span style={{
            fontSize: 11, fontWeight: 600,
            background: 'var(--accent)',
            color: '#fff',
            borderRadius: 10,
            padding: '2px 8px',
          }}>
            {selected.length} selected
          </span>
        )}
      </div>
      {items.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--fg-3)', margin: '4px 0' }}>No items available.</p>
      ) : (
        <div style={{
          maxHeight: 160,
          overflowY: 'auto',
          border: `1px solid ${error ? 'var(--danger, #FF6B6B)' : 'var(--border-1)'}`,
          borderRadius: 8,
          padding: '6px 10px',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}>
          {items.map(item => (
            <label key={item.id} style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 14,
              cursor: 'pointer',
              padding: '3px 0',
            }}>
              <input
                type="checkbox"
                checked={selected.includes(item.id)}
                onChange={() => toggle(item.id)}
                style={{ accentColor: 'var(--accent)', width: 15, height: 15 }}
              />
              {item.name}
            </label>
          ))}
        </div>
      )}
      {error && <span className="auth-error">{error}</span>}
    </div>
  );
}

// ── Education board selector (with smart state-board handling) ─────
export function EducationBoardField({
  value,
  onChange,
  stateBoard,
  onStateBoardChange,
  state,
  error,
  stateBoardError,
  optional,
}: {
  value: string;                            // education board code
  onChange: (v: string) => void;
  stateBoard: string;                       // resolved state-board name
  onStateBoardChange: (v: string) => void;
  state: string;                            // address state, for suggestion
  error?: string;
  stateBoardError?: string;
  optional?: boolean;
}) {
  const isStateBoard = value === 'STATE_BOARD';
  const suggestion = suggestStateBoard(state);

  // Auto-fill the state board from the address state once State Board is picked
  // (or when the state changes), but never clobber a value the user has typed.
  useEffect(() => {
    if (isStateBoard && !stateBoard.trim() && suggestion) {
      onStateBoardChange(suggestion);
    }
  }, [isStateBoard, suggestion]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <SelectField
        label="Education board"
        value={value}
        onChange={onChange}
        options={EDUCATION_BOARD_OPTIONS}
        icon="hash"
        placeholder="— Select board —"
        optional={optional}
        error={error}
        hint="Your curriculum board — CBSE, ICSE/CISCE, IB, Cambridge, or your State Board."
      />
      {isStateBoard && (
        <ProfileField
          label="State board"
          value={stateBoard}
          onChange={onStateBoardChange}
          placeholder={suggestion || 'Enter your state above to auto-detect'}
          icon="mapPin"
          error={stateBoardError}
          hint={
            suggestion
              ? `Auto-detected from your state — edit if needed.`
              : 'Fill in your state (under Location) to auto-detect your board.'
          }
        />
      )}
    </>
  );
}

// ── Profile image picker ──────────────────────────────────────────
export function ImagePicker({
  value,
  hue,
  onChange,
}: {
  value: string;
  hue: number;
  onChange: (dataUrl: string) => void;
}) {
  const [busy, setBusy] = useState(false);

  const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showToast('Please choose an image file.', 'danger');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      showToast('Image is too large (max 8 MB).', 'danger');
      return;
    }
    setBusy(true);
    try {
      onChange(await fileToResizedDataUrl(file));
    } catch {
      showToast('Could not process that image.', 'danger');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-field">
      <div className="auth-field-header">
        <label className="auth-label">
          Profile image <span className="auth-optional">(optional)</span>
        </label>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <span
          aria-hidden
          style={{
            width: 56, height: 56, borderRadius: '50%',
            display: 'grid', placeItems: 'center', overflow: 'hidden',
            background: value ? undefined : `linear-gradient(135deg, hsl(${hue},80%,72%), hsl(${(hue + 40) % 360},75%,62%))`,
            flex: '0 0 auto',
          }}
        >
          {value
            ? <img src={value} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <Icon name="user" size={22} />}
        </span>
        <label className="btn" style={{ background: 'var(--surface-2)', color: 'var(--fg-2)', cursor: 'pointer' }}>
          {busy ? 'Processing…' : value ? 'Change photo' : 'Upload photo'}
          <input type="file" accept="image/*" onChange={pick} style={{ display: 'none' }} />
        </label>
        {value && (
          <button
            type="button"
            className="auth-link"
            onClick={() => onChange('')}
            style={{ fontSize: 13 }}
          >
            Remove
          </button>
        )}
      </div>
    </div>
  );
}
