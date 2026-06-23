import { api } from '../lib/api';
import { useAsync } from './useApi';

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'GENERAL' | 'QUIZ' | 'RESULT' | 'CERTIFICATE' | 'REMINDER';
  target: string;
  isSent: boolean;
  createdAt: string;
}

export function useNotifications(params: { page?: number; limit?: number } = {}) {
  return useAsync<{ items: Notification[]; meta: unknown }>(
    () => api.getWithQuery('/notifications', { page: 1, limit: 20, ...params }),
    [JSON.stringify(params)],
  );
}

export const notificationApi = {
  create: (data: { title: string; message: string; type?: string; target?: string }) =>
    api.post('/notifications', data),
  remove: (id: string) => api.delete(`/notifications/${id}`),
};
