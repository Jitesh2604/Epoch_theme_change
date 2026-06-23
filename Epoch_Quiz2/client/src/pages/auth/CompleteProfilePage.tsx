import React, { useEffect } from 'react';
import type { NavigateFn } from '../../types';
import { loadUser, toUIRole } from '../../lib/authStore';

interface Props { navigate: NavigateFn; }

/**
 * Dispatcher for the bare `#/complete-profile` route. Sends each user to the
 * role-specific onboarding page, or straight to their dashboard if their
 * profile is already complete (admins are never gated).
 */
export const CompleteProfilePage: React.FC<Props> = ({ navigate }) => {
  const user = loadUser();

  useEffect(() => {
    if (!user) { navigate('login'); return; }
    const uiRole = toUIRole(user.role);
    if (user.profileComplete) { window.location.href = `/${uiRole}`; return; }
    if (user.role === 'TEACHER')      navigate('complete-profile/teacher');
    else if (user.role === 'STUDENT') navigate('complete-profile/student');
    else                              window.location.href = `/${uiRole}`; // admins skip onboarding
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
};
