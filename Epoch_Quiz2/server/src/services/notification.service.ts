import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { NotificationType, NotificationTarget } from '../lib/enums';
import { ApiError } from '../utils/ApiError';
import { pageMeta, pageToSkipTake } from '../utils/pagination';
import { toJson } from '../utils/json';
import type { Actor } from './assessment.service';

export interface CreateNotificationInput {
  title:       string;
  message:     string;
  type?:       NotificationType;
  target?:     NotificationTarget;
  targetIds?:  string[];
  scheduledAt?: Date | null;
}

export const NotificationService = {
  async create(_actor: Actor, input: CreateNotificationInput) {
    return prisma.notification.create({
      data: {
        title:       input.title,
        message:     input.message,
        type:        input.type   ?? NotificationType.GENERAL,
        target:      input.target ?? NotificationTarget.ALL,
        targetIds:   toJson(input.targetIds ?? []),
        scheduledAt: input.scheduledAt ?? null,
        isSent:      false,
      },
    });
  },

  async list(_actor: Actor, query: { page?: number; limit?: number; type?: NotificationType }) {
    const { page = 1, limit = 20, type } = query;
    const { skip, take } = pageToSkipTake(page, limit);

    const where: Prisma.NotificationWhereInput = { ...(type && { type }) };

    const [items, total] = await Promise.all([
      prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
      prisma.notification.count({ where }),
    ]);
    return { items, meta: pageMeta(total, page, limit) };
  },

  async findById(_actor: Actor, id: string) {
    const n = await prisma.notification.findUnique({ where: { id } });
    if (!n) throw ApiError.notFound('Notification not found');
    return n;
  },

  async remove(_actor: Actor, id: string) {
    const n = await prisma.notification.findUnique({ where: { id }, select: { id: true } });
    if (!n) throw ApiError.notFound('Notification not found');
    await prisma.notification.delete({ where: { id } });
  },
};
