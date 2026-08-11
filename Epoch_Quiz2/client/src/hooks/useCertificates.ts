import { api } from '../lib/api';
import { useAsync } from './useApi';

export type CertificateScope = 'global' | 'state' | 'school';

export interface Certificate {
  certificateId: string;
  type:          string;
  title:         string;
  description:   string;
  scope:         CertificateScope;
  studentName:   string;
  rank:          number;
  score:         number;
  totalMarks:    number;
  percent:       number;
  sessionTitle:  string;
  schoolName:    string | null;
  state:         string | null;
  className:     string | null;
  issuedAt:      string;
  devFallback:   boolean;
}

export interface VerifyResult {
  valid:        boolean;
  studentName?: string;
  title?:       string;
  rank?:        number | null;
  score?:       number;
  totalMarks?:  number;
  issuedAt?:    string;
  sessionTitle?: string;
}

export function useMyCertificates() {
  return useAsync<Certificate[]>(() => api.get('/certificates/me'), []);
}

export function verifyCertificate(certificateId: string) {
  return api.get<VerifyResult>(`/certificates/verify/${encodeURIComponent(certificateId)}`, { skipAuth: true });
}
