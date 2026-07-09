-- Drop the transient catalog-migration report table.
-- Its contents were exported to prisma/backups/ during the catalog migration.
DROP TABLE IF EXISTS `_catalog_migration_report`;
