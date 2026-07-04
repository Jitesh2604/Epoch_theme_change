import React from 'react';
import type { NavigateFn } from '../../types';
import { Icon } from '../ui/Icon';
import { useSubjects, type Subject } from '../../hooks/useSubjects';
import { CategoryGridSkeleton, CategoryGridError, CategoryGridEmpty } from './CategoryGridStates';

/**
 * Icon + blurb per subject KIND. Behaviour is decided by the DB `kind`, never by
 * list position or hardcoded ids/names.
 */
function metaForKind(kind: Subject['kind']): { icon: string; blurb: string } {
  switch (kind) {
    case 'PRACTICE_OLYMPIAD':  return { icon: 'trophy',  blurb: 'A mixed quiz across all your subjects.' };
    case 'ATTEMPTED_OLYMPIAD': return { icon: 'refresh', blurb: 'Review your past Olympiad attempts.' };
    default:                   return { icon: 'bookOpen', blurb: 'Practice questions for your class & board.' };
  }
}

interface Props {
  navigate: NavigateFn;
  /** tweaks.catCardStyle — keeps card visuals in sync across pages. */
  cardStyle?: string;
  /** Label for the "back" button in the error state. */
  backLabel?: string;
}

/**
 * The single, shared Categories grid used by BOTH the Home page and the Quiz
 * Play page. Fetches every subject from the Subjects API (incl. the special
 * Olympiad rows) and routes each card by its `kind`. Add a subject in the DB →
 * it appears on every page that renders this component, with no code changes.
 */
export const SubjectCategoryGrid: React.FC<Props> = ({ navigate, cardStyle, backLabel = 'Back' }) => {
  const { data: subjects, loading, error } = useSubjects();
  const hasSubjects = !!subjects && subjects.length > 0;

  const open = (s: Subject) => {
    if (s.kind === 'PRACTICE_OLYMPIAD')  { navigate('olympiad'); return; }
    if (s.kind === 'ATTEMPTED_OLYMPIAD') { navigate('olympiad/history'); return; }
    navigate(`play/${s.slug}/${s.id}/level`);
  };

  if (loading)      return <CategoryGridSkeleton cardStyle={cardStyle} count={6} />;
  if (error)        return <CategoryGridError navigate={navigate} backLabel={backLabel} />;
  if (!hasSubjects) return <CategoryGridEmpty />;

  return (
    <div className="cat-grid" data-card-style={cardStyle}>
      {subjects!.map((s, i) => {
        const meta = metaForKind(s.kind);
        return (
          <button key={s.id} className="cat-card" onClick={() => open(s)}>
            {cardStyle === 'numbered' && (
              <span className="cat-num">{String(i + 1).padStart(2, '0')} —</span>
            )}
            <div className="cat-ico"><Icon name={meta.icon} size={20} /></div>
            <h3>{s.name}</h3>
            <p>{meta.blurb}</p>
            <span className="cat-arrow"><Icon name="arrowUpRight" size={18} /></span>
          </button>
        );
      })}
    </div>
  );
};
