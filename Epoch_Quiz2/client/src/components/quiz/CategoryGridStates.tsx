import React from 'react';
import type { NavigateFn } from '../../types';
import { Icon } from '../ui/Icon';

/** Loading placeholder for a `cat-grid` (matches the card layout height). */
export const CategoryGridSkeleton: React.FC<{ cardStyle?: string; count?: number }> = ({
  cardStyle,
  count = 4,
}) => (
  <div className="cat-grid" data-card-style={cardStyle}>
    {Array.from({ length: count }, (_, i) => (
      <div key={i} className="assess-skel" style={{ height: 160 }} />
    ))}
  </div>
);

/** Shown when the subjects/questions request fails. */
export const CategoryGridError: React.FC<{ navigate: NavigateFn; backLabel: string }> = ({
  navigate,
  backLabel,
}) => (
  <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--fg-3)' }}>
    <Icon name="info" size={28} style={{ marginBottom: 12, color: 'var(--danger)' } as React.CSSProperties} />
    <p style={{ fontSize: 14 }}>Could not load subjects. Please try again.</p>
    <button className="btn btn-ghost" style={{ marginTop: 12 }} onClick={() => navigate('play')}>
      {backLabel}
    </button>
  </div>
);

/** Shown when there are no subjects/categories yet. */
export const CategoryGridEmpty: React.FC = () => (
  <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--fg-3)' }}>
    <Icon name="bookOpen" size={36} style={{ marginBottom: 16, opacity: 0.35 } as React.CSSProperties} />
    <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--fg-2)', marginBottom: 6 }}>
      No categories yet
    </p>
    <p style={{ fontSize: 13, maxWidth: 340, margin: '0 auto' }}>
      No subjects have been added yet. Once an admin adds a subject, it will appear here automatically.
    </p>
  </div>
);
