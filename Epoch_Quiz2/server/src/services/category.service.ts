import { prisma } from '../lib/prisma';

interface CategoryItem {
  id: string;
  name: string;
  slug: string;
}

export const CategoryService = {
  async list(): Promise<CategoryItem[]> {
    return prisma.category.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, name: true, slug: true },
      orderBy: { name: 'asc' },
    });
  },
};
