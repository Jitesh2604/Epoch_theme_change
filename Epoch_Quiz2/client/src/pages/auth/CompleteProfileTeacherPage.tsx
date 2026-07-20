import React, { useState, useEffect } from 'react';
import type { NavigateFn } from '../../types';
import { Icon } from '../../components/ui/Icon';
import { showToast } from '../../components/ui/Toast';
import { AuthIllustration } from './_shared';
import { Section, ProfileField, SelectField, MultiCheckbox, ImagePicker, EducationBoardField } from './profileFields';
import { loadUser, updateProfile, toUIRole, getMe } from '../../lib/authStore';
import { ApiError } from '../../lib/api';
import type { ProfileUpdateData } from '../../lib/authStore';
import { useClasses, useCatalogSeries, useBooks, catalogPresets } from '../../hooks/useCatalog';
import { useSubjects } from '../../hooks/useSubjects';

interface Props { navigate: NavigateFn; }

export const CompleteProfileTeacherPage: React.FC<Props> = ({ navigate }) => {
  const user = loadUser();

  useEffect(() => {
    if (!user) { navigate('login'); return; }
    if (user.role !== 'TEACHER') { navigate('complete-profile'); return; }
    if (user.profileComplete) { window.location.href = `/${toUIRole(user.role)}`; }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Catalog data ─────────────────────────────────────────────
  const classes  = useClasses();
  const series   = useCatalogSeries();
  const subjects = useSubjects();

  // ── Form state ───────────────────────────────────────────────
  const [name,       setName]       = useState(user?.name ?? '');
  const [dob,        setDob]        = useState('');
  const [schoolName, setSchoolName] = useState('');
  const [educationBoard, setEducationBoard] = useState('');
  const [stateBoard, setStateBoard] = useState('');
  const [classIds,   setClassIds]   = useState<string[]>([]);
  const [subjectIds, setSubjectIds] = useState<string[]>([]);
  const [seriesIds,  setSeriesIds]  = useState<string[]>([]);
  const [bookIds,    setBookIds]    = useState<string[]>([]);
  const [teacherCode, setTeacherCode] = useState('');
  const [bio,        setBio]        = useState('');
  const [country,    setCountry]    = useState('');
  const [state,      setState]      = useState('');
  const [city,       setCity]       = useState('');
  const [zip,        setZip]        = useState('');
  const [address,    setAddress]    = useState('');
  const [imageUrl,   setImageUrl]   = useState('');

  const [errors, setErrors]   = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  // Auto-generated teacher code is created at registration — fetch it to display.
  useEffect(() => {
    getMe().then(me => {
      const tp = (me as any).teacherProfile;
      if (tp?.teacherCode) setTeacherCode(tp.teacherCode);
    }).catch(() => {});
  }, []);

  const books = useBooks({});

  if (!user) return null;

  const countryOptions = catalogPresets.countries.map(c => ({ value: c, label: c }));

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
    if (!educationBoard) errs.educationBoard = 'Please select your education board.';
    if (educationBoard === 'STATE_BOARD' && !stateBoard.trim()) errs.stateBoard = 'Please confirm your state board.';

    // Catalog-backed selections are required only when options exist, so an
    // empty catalog can never permanently block onboarding.
    if ((classes.data ?? []).length && classIds.length === 0) errs.classes = 'Select at least one class.';
    if ((subjects.data ?? []).length && subjectIds.length === 0) errs.subjects = 'Select at least one subject.';
    if ((series.data ?? []).length && seriesIds.length === 0) errs.series = 'Select at least one series.';
    if ((books.data ?? []).length && bookIds.length === 0) errs.books = 'Select at least one book.';
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
        name:       name.trim() || undefined,
        dob:        dob || null,
        schoolName: schoolName.trim() || null,
        educationBoard: educationBoard || null,
        stateBoard: educationBoard === 'STATE_BOARD' ? (stateBoard.trim() || null) : null,
        classExternalIds:   classIds,
        subjectExternalIds: subjectIds,
        seriesExternalIds:  seriesIds,
        bookExternalIds:    bookIds,
        bio:        bio.trim() || null,
        country:    country || null,
        state:      state.trim() || null,
        city:       city.trim() || null,
        zip:        zip.trim() || null,
        address:    address.trim() || null,
        imageUrl:   imageUrl || null,
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
      <div className="auth-card" style={{ maxWidth: 580 }}>

        <button className="auth-brand" onClick={() => navigate('home')}>
          <img src="assets/logo-mark.svg" alt="" className="auth-logo-img" />
          <div>
            <div className="auth-brand-name">Olympiad <em>Quiz</em></div>
            <div className="auth-brand-sub">STUDENT PRACTICE PLATFORM</div>
          </div>
        </button>

        <div className="auth-head">
          <h2 className="auth-title">Complete your profile</h2>
          <p className="auth-sub">
            One quick step before you start. Tell us about your teaching so we can
            personalise your workspace.
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
            <ImagePicker value={imageUrl} hue={user.avatarHue} onChange={setImageUrl} />
          </Section>

          {/* ── Institution ────────────────────────────────────── */}
          <Section title="Institution">
            <ProfileField
              label="School name" value={schoolName} onChange={setSchoolName}
              placeholder="Name of your school or institution" icon="building" error={errors.schoolName}
            />
            <EducationBoardField
              value={educationBoard} onChange={setEducationBoard}
              stateBoard={stateBoard} onStateBoardChange={setStateBoard}
              state={state} error={errors.educationBoard} stateBoardError={errors.stateBoard}
            />
          </Section>

          {/* ── Teaching ───────────────────────────────────────── */}
          <Section title="Teaching">
            <MultiCheckbox
              label="Classes" items={classes.data ?? []}
              selected={classIds} onChange={setClassIds} error={errors.classes}
            />
            <MultiCheckbox
              label="Subjects" items={(subjects.data ?? []).map(s => ({ id: s.id, name: s.name }))}
              selected={subjectIds} onChange={setSubjectIds} error={errors.subjects}
            />
            <MultiCheckbox
              label="Series" items={series.data ?? []}
              selected={seriesIds} onChange={setSeriesIds} error={errors.series}
            />
            <MultiCheckbox
              label="Books" items={books.data ?? []}
              selected={bookIds} onChange={setBookIds} error={errors.books}
            />
            {teacherCode && (
              <div className="auth-field">
                <div className="auth-field-header">
                  <label className="auth-label">Your Teacher Code</label>
                </div>
                <div className="auth-input-wrap" style={{ opacity: 0.85 }}>
                  <span className="auth-input-icon"><Icon name="key" size={16} /></span>
                  <input
                    className="auth-input"
                    type="text"
                    value={teacherCode}
                    readOnly
                    style={{ cursor: 'default', letterSpacing: 3, fontWeight: 700 }}
                  />
                </div>
                <span className="auth-hint">Share this code with your students so they can join your class.</span>
              </div>
            )}
          </Section>

          {/* ── About ──────────────────────────────────────────── */}
          <Section title="About">
            <div className="auth-field">
              <div className="auth-field-header">
                <label className="auth-label">Bio <span className="auth-optional">(optional)</span></label>
              </div>
              <textarea
                className="auth-input auth-textarea"
                value={bio}
                onChange={e => setBio(e.target.value)}
                placeholder="A short introduction for your students…"
                rows={3}
                maxLength={1000}
              />
            </div>
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
