import React, { useState, useEffect } from 'react';
import type { NavigateFn } from '../../types';
import { Icon } from '../../components/ui/Icon';
import { showToast } from '../../components/ui/Toast';
import { AuthIllustration } from './_shared';
import { Section, ProfileField, SelectField, ImagePicker, EducationBoardField } from './profileFields';
import { loadUser, updateProfile, toUIRole } from '../../lib/authStore';
import { ApiError } from '../../lib/api';
import type { ProfileUpdateData } from '../../lib/authStore';
import { catalogPresets, useClasses } from '../../hooks/useCatalog';
import { useRealSubjects } from '../../hooks/useSubjects';

interface Props { navigate: NavigateFn; }

export const CompleteProfileStudentPage: React.FC<Props> = ({ navigate }) => {
  const user = loadUser();

  useEffect(() => {
    if (!user) { navigate('login'); return; }
    if (user.role !== 'STUDENT') { navigate('complete-profile'); return; }
    if (user.profileComplete) { window.location.href = `/${toUIRole(user.role)}`; }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Form state ───────────────────────────────────────────────
  const [name,        setName]        = useState(user?.name ?? '');
  const [dob,         setDob]         = useState('');
  const [schoolName,  setSchoolName]  = useState('');
  const [classId,     setClassId]     = useState('');
  const [subjectIds,  setSubjectIds]  = useState<string[]>([]);
  const [educationBoard, setEducationBoard] = useState('');
  const [stateBoard,  setStateBoard]  = useState('');
  const [country,     setCountry]     = useState('');
  const [state,       setState]       = useState('');
  const [city,        setCity]        = useState('');
  const [zip,         setZip]         = useState('');
  const [address,     setAddress]     = useState('');
  const [imageUrl,    setImageUrl]    = useState('');

  const [errors, setErrors]   = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  // Grade levels (Class 1–12) from the catalog.
  const classes = useClasses();
  // Studiable subjects (excludes the Olympiad "mode" rows) — chosen by the student.
  const subjects = useRealSubjects();
  const toggleSubject = (id: string) =>
    setSubjectIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  if (!user) return null;

  const countryOptions = catalogPresets.countries.map(c => ({ value: c, label: c }));
  const classOptions   = (classes.data ?? []).map(c => ({ value: c.id, label: c.name }));

  const validate = (): Record<string, string> => {
    const errs: Record<string, string> = {};
    const reqText = (key: string, val: string) => { if (!val.trim()) errs[key] = 'This field is required.'; };
    reqText('name', name);
    if (!dob) errs.dob = 'This field is required.';
    reqText('schoolName', schoolName);
    if (!country) errs.country = 'This field is required.';
    reqText('state', state);
    reqText('city', city);
    reqText('zip', zip);
    reqText('address', address);
    if (classOptions.length && !classId) errs.classId = 'Please select your class.';
    if ((subjects.data?.length ?? 0) > 0 && subjectIds.length === 0) errs.subjects = 'Select at least one subject.';
    if (!educationBoard) errs.educationBoard = 'Please select your education board.';
    if (educationBoard === 'STATE_BOARD' && !stateBoard.trim()) errs.stateBoard = 'Please confirm your state board.';
    return errs;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length) {
      showToast('Please fill in all required fields to continue.', 'danger');
      return;
    }

    setLoading(true);
    try {
      const payload: ProfileUpdateData = {
        name:        name.trim() || undefined,
        dob:         dob || null,
        schoolName:  schoolName.trim() || null,
        classExternalId:    classId || null,
        subjectExternalIds: subjectIds,
        educationBoard: educationBoard || null,
        stateBoard:  educationBoard === 'STATE_BOARD' ? (stateBoard.trim() || null) : null,
        country:     country || null,
        state:       state.trim() || null,
        city:        city.trim() || null,
        zip:         zip.trim() || null,
        address:     address.trim() || null,
        imageUrl:    imageUrl || null,
      };
      await updateProfile(payload);
      showToast('Profile saved — welcome to Epoch Quiz!', 'success');
      window.location.href = '/#/home';
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Could not save profile. Please try again.';
      showToast(msg, 'danger');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card" style={{ maxWidth: 560 }}>

        <button className="auth-brand" onClick={() => navigate('home')}>
          <img src="assets/logo-mark.svg" alt="" className="auth-logo-img" />
          <div>
            <div className="auth-brand-name">Olympaid <em>Quiz</em></div>
            <div className="auth-brand-sub">EPOCH · AI · CO-PILOT</div>
          </div>
        </button>

        <div className="auth-head">
          <h2 className="auth-title">Complete your profile</h2>
          <p className="auth-sub">
            One quick step before you start learning.
          </p>
        </div>

        <form className="auth-form" onSubmit={submit} noValidate>

          {/* ── Personal ───────────────────────────────────────── */}
          <Section title="Personal">
            <ProfileField
              label="Full name" value={name} onChange={setName}
              placeholder="Your full name" icon="user" error={errors.name}
            />
            <ProfileField
              label="Date of birth" type="date" value={dob} onChange={setDob}
              icon="calendar" error={errors.dob}
            />
            <ProfileField
              label="School name" value={schoolName} onChange={setSchoolName}
              placeholder="Name of your school" icon="building" error={errors.schoolName}
            />
            <SelectField
              label="Class" value={classId} onChange={setClassId}
              options={classOptions} icon="user" placeholder="— Select your class —"
              error={errors.classId} hint="Your current grade / class (1st–12th)."
            />

            {/* Subjects — select every subject you study. Drives both Subject
                Practice and the mixed Practice Olympiad. */}
            <div className="auth-field">
              <div className="auth-field-header">
                <label className="auth-label">Subjects</label>
                <span style={{ fontSize: 11, color: 'var(--fg-3)' }}>{subjectIds.length} selected</span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {(subjects.data ?? []).map(s => {
                  const on = subjectIds.includes(s.id);
                  return (
                    <button
                      type="button"
                      key={s.id}
                      onClick={() => toggleSubject(s.id)}
                      style={{
                        fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                        borderRadius: 999, padding: '6px 12px',
                        border: `1px solid ${on ? 'var(--brand)' : 'var(--border-1)'}`,
                        background: on ? 'var(--brand)' : 'var(--surface-1)',
                        color: on ? 'var(--brand-ink, #fff)' : 'var(--fg-2)',
                      }}
                    >
                      {on ? '✓ ' : ''}{s.name}
                    </button>
                  );
                })}
                {!subjects.loading && !(subjects.data?.length) && (
                  <span style={{ fontSize: 12, color: 'var(--fg-3)' }}>No subjects available yet.</span>
                )}
              </div>
              {errors.subjects && <span className="auth-error">{errors.subjects}</span>}
            </div>

            <EducationBoardField
              value={educationBoard} onChange={setEducationBoard}
              stateBoard={stateBoard} onStateBoardChange={setStateBoard}
              state={state} error={errors.educationBoard} stateBoardError={errors.stateBoard}
            />
            <ImagePicker value={imageUrl} hue={user.avatarHue} onChange={setImageUrl} />
          </Section>

          {/* ── Location ───────────────────────────────────────── */}
          <Section title="Location">
            <SelectField
              label="Country" value={country} onChange={setCountry}
              options={countryOptions} icon="globe" placeholder="— Select country —" error={errors.country}
            />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
              <ProfileField label="State" value={state} onChange={setState}
                placeholder="Maharashtra" icon="mapPin" error={errors.state} />
              <ProfileField label="City" value={city} onChange={setCity}
                placeholder="Mumbai" icon="mapPin" error={errors.city} />
              <ProfileField label="ZIP / PIN code" value={zip} onChange={setZip}
                placeholder="400001" icon="hash" error={errors.zip} />
            </div>
            <div className="auth-field">
              <div className="auth-field-header">
                <label className="auth-label">Street address</label>
              </div>
              <textarea
                className={`auth-input auth-textarea ${errors.address ? 'error' : ''}`}
                value={address}
                onChange={e => setAddress(e.target.value)}
                placeholder="Flat / building / street…"
                rows={2}
                maxLength={500}
              />
              {errors.address && <span className="auth-error">{errors.address}</span>}
            </div>
          </Section>

          <button type="submit" className="btn btn-primary auth-submit" style={{ marginTop: 8 }} disabled={loading}>
            {loading
              ? <><span className="auth-spinner" /> Saving…</>
              : <>Save &amp; continue <Icon name="arrowRight" size={16} /></>
            }
          </button>
        </form>

        <p className="auth-switch">
          Need to use a different account?{' '}
          <button className="auth-link" onClick={() => navigate('login')}>Sign in</button>
        </p>
      </div>

      <AuthIllustration />
    </div>
  );
};
