import type { AdminOverview, DashboardStats } from '../hooks/useDashboard';

/**
 * Feature A1: Admin Dashboard — System Alerts.
 *
 * Pure derivation over the already-fetched AdminOverview/DashboardStats
 * payloads — no new query. Deliberately does NOT include "Assessment
 * starting today" / "ending soon" (Assessment.startDatetime/endDatetime are
 * schema columns that are never written or read anywhere in this app — see
 * assessment.service.ts — so they'd always be null, and an alert built on
 * them would either never fire or silently mislead) or "students with
 * repeated failed logins" (no failed-login/lockout tracking exists
 * anywhere — see settings.service.ts's own comment flagging this as an
 * unimplemented gap). Only alerts backed by real, current data are ever
 * emitted, per the spec's own "only display alerts supported by real data."
 */

export interface SystemAlert {
  id: string;
  severity: 'critical' | 'warning';
  message: string;
}

export function buildSystemAlerts(overview: AdminOverview | null, stats: DashboardStats | null): SystemAlert[] {
  const alerts: SystemAlert[] = [];
  if (!overview) return alerts;

  if (overview.questionBank.total === 0) {
    alerts.push({ id: 'question-bank-empty', severity: 'critical', message: 'Question Bank is empty.' });
  } else if (overview.questionBank.gradableActiveCount === 0) {
    // Distinct from the empty-bank case above — questions exist, but none
    // of them are a gradable type Practice/Olympiad can actually draw from.
    alerts.push({ id: 'practice-olympiad-no-questions', severity: 'critical', message: 'Practice Olympiad has no questions to draw from.' });
  }

  if (overview.contentCatalog.totalSubjects === 0) {
    alerts.push({ id: 'no-subjects', severity: 'warning', message: 'No subjects are configured in the content catalog.' });
  }

  if (stats && stats.counts.students === 0) {
    alerts.push({ id: 'no-students', severity: 'warning', message: 'No students have registered yet.' });
  }

  return alerts;
}
