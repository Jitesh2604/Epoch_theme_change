import React, { useState, useEffect } from 'react';
import type { NavigateFn } from '../../types';
import { Icon } from '../../components/ui/Icon';
import { Field, PasswordFieldInner, AuthIllustration, validateEmail, validateName } from '../auth/_shared';
import { SelectField, ProfileField } from '../auth/profileFields';
import { schoolApi, type CatalogItem, type SchoolBranchItem } from '../../hooks/useSchools';
import { ApiError } from '../../lib/api';

interface SchoolRegisterPageProps { navigate: NavigateFn; }

export const SchoolRegisterPage: React.FC<SchoolRegisterPageProps> = ({ navigate }) => {
  const [name, setName]             = useState('');
  const [email, setEmail]           = useState('');
  const [password, setPassword]     = useState('');
  const [mobileNo, setMobileNo]     = useState('');

  const [schoolId, setSchoolId]     = useState('');
  const [stateId, setStateId]       = useState('');
  const [branchId, setBranchId]     = useState('');

  const [contactPersonName, setContactPersonName] = useState('');
  const [contactPhone, setContactPhone]           = useState('');
  const [address, setAddress]       = useState('');
  const [city, setCity]             = useState('');
  const [pincode, setPincode]       = useState('');

  const [schools, setSchools]   = useState<CatalogItem[]>([]);
  const [states, setStates]     = useState<CatalogItem[]>([]);
  const [branches, setBranches] = useState<SchoolBranchItem[]>([]);
  const [loadingStates, setLoadingStates]   = useState(false);
  const [loadingBranches, setLoadingBranches] = useState(false);

  const [errors, setErrors]   = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Full catalog, loaded once — School is the top of the hierarchy.
  useEffect(() => {
    schoolApi.listSchools().then(setSchools).catch(() => setSchools([]));
  }, []);

  // School -> State cascade: only states that this school actually has an
  // active branch in (see SchoolStateService.list's schoolId param).
  useEffect(() => {
    setStateId('');
    setBranchId('');
    setStates([]);
    setBranches([]);
    if (!schoolId) return;
    setLoadingStates(true);
    schoolApi.listStates(schoolId)
      .then(setStates)
      .catch(() => setStates([]))
      .finally(() => setLoadingStates(false));
  }, [schoolId]);

  // State -> Branch cascade.
  useEffect(() => {
    setBranchId('');
    setBranches([]);
    if (!schoolId || !stateId) return;
    setLoadingBranches(true);
    schoolApi.listBranches(schoolId, stateId)
      .then(setBranches)
      .catch(() => setBranches([]))
      .finally(() => setLoadingBranches(false));
  }, [schoolId, stateId]);

  const schoolOptions  = schools.map(s => ({ value: s.id, label: s.name }));
  const stateOptions   = states.map(s => ({ value: s.id, label: s.name }));
  const branchOptions  = branches.map(b => ({ value: b.id, label: b.name }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    const nErr = validateName(name);
    const eErr = validateEmail(email);
    if (nErr) errs.name = nErr;
    if (eErr) errs.email = eErr;
    if (!/^\d{7,}$/.test(mobileNo.replace(/[\s\-\+\(\)]/g, ''))) errs.mobileNo = 'Enter a valid mobile number (min 7 digits)';
    if (password.length < 8) errs.password = 'Password must be at least 8 characters';
    if (!schoolId) errs.schoolId = 'Select a school';
    if (!stateId)  errs.stateId  = 'Select a state';
    if (!branchId) errs.branchId = 'Select a branch';
    if (validateName(contactPersonName)) errs.contactPersonName = 'Contact person name is required';
    if (!/^\d{7,}$/.test(contactPhone.replace(/[\s\-\+\(\)]/g, ''))) errs.contactPhone = 'Enter a valid phone number (min 7 digits)';
    if (!address.trim()) errs.address = 'Address is required';
    if (!city.trim())    errs.city    = 'City is required';
    if (!pincode.trim()) errs.pincode = 'Pincode is required';
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setLoading(true);
    try {
      await schoolApi.register({
        name, email, password, mobileNo,
        schoolId, stateId, branchId,
        contactPersonName, contactPhone, address, city, pincode,
      });
      setSubmitted(true);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Registration failed. Please try again.';
      setErrors({ email: msg });
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="auth-page">
        <div className="auth-card" style={{ textAlign: 'center' }}>
          <div className="auth-head">
            <h2 className="auth-title">Registration submitted</h2>
            <p className="auth-sub">
              Thanks — your school's registration has been received and is pending review by an Epoch Quiz
              administrator. You'll be able to sign in once it's approved.
            </p>
          </div>
          <button type="button" className="btn btn-primary auth-submit" onClick={() => navigate('home')}>
            Back to home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <button className="auth-brand" onClick={() => navigate('home')}>
          <img src="/assets/logo-mark.svg" alt="" className="auth-logo-img" />
          <div>
            <div className="auth-brand-name">Olympiad <em>Quiz</em></div>
            <div className="auth-brand-sub">SCHOOL PANEL</div>
          </div>
        </button>

        <div className="auth-head">
          <h2 className="auth-title">Register your school</h2>
          <p className="auth-sub">Pick your school, state, and branch, then fill in your details to get started.</p>
        </div>

        <form className="auth-form" onSubmit={submit} noValidate>
          <SelectField
            label="School name" icon="graduation" value={schoolId} onChange={setSchoolId}
            options={schoolOptions} placeholder="Select school name" error={errors.schoolId}
          />
          <SelectField
            label="State" icon="mapPin" value={stateId} onChange={setStateId}
            options={stateOptions} error={errors.stateId}
            disabled={!schoolId || loadingStates}
            placeholder={!schoolId ? 'Select a school first' : loadingStates ? 'Loading states…' : 'Select state'}
          />
          <SelectField
            label="Branch" icon="building" value={branchId} onChange={setBranchId}
            options={branchOptions} error={errors.branchId}
            disabled={!stateId || loadingBranches}
            placeholder={!stateId ? 'Select a state first' : loadingBranches ? 'Loading branches…' : 'Select branch'}
          />

          <Field
            label="Contact person name" type="text" value={contactPersonName} onChange={setContactPersonName}
            placeholder="Principal / coordinator name" icon="user" error={errors.contactPersonName}
          />
          <Field
            label="School contact phone" type="tel" value={contactPhone} onChange={setContactPhone}
            placeholder="+91 98765 43210" icon="phone" error={errors.contactPhone}
          />
          <ProfileField
            label="School address" value={address} onChange={setAddress}
            placeholder="Street, area" icon="mapPin" error={errors.address}
          />
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <ProfileField label="City" value={city} onChange={setCity} placeholder="City" icon="mapPin" error={errors.city} />
            </div>
            <div style={{ flex: 1 }}>
              <ProfileField label="Pincode" value={pincode} onChange={setPincode} placeholder="Pincode" icon="hash" error={errors.pincode} />
            </div>
          </div>

          <Field
            label="Your full name" type="text" value={name} onChange={setName}
            placeholder="Your name (account owner)" icon="user" error={errors.name}
          />
          <Field
            label="Your mobile number" type="tel" value={mobileNo} onChange={setMobileNo}
            placeholder="+91 98765 43210" icon="phone" error={errors.mobileNo}
          />
          <Field
            label="Email address" type="email" value={email} onChange={setEmail}
            placeholder="you@school.edu" icon="mail" error={errors.email}
          />

          <div className="auth-field">
            <label className="auth-label">Password</label>
            <div className={`auth-input-wrap ${errors.password ? 'error' : ''}`}>
              <span className="auth-input-icon"><Icon name="lock" size={16} /></span>
              <PasswordFieldInner value={password} onChange={setPassword} />
            </div>
            {errors.password && <span className="auth-error">{errors.password}</span>}
          </div>

          <button type="submit" className="btn btn-primary auth-submit" disabled={loading}>
            {loading
              ? <><span className="auth-spinner" /> Submitting…</>
              : <>Submit registration <Icon name="arrowRight" size={16} /></>
            }
          </button>
        </form>

        <p className="auth-switch">
          Already registered?{' '}
          <button className="auth-link" onClick={() => navigate('login')}>Sign in</button>
        </p>
      </div>

      <AuthIllustration />
    </div>
  );
};
