import { sql } from "drizzle-orm";
import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const documentIndexerConfigTable = pgTable("document_indexer_config", {
  id: integer("id").primaryKey().default(1),
  rootPath: text("root_path").notNull(),
  includeExtensions: text("include_extensions")
    .array()
    .notNull()
    .default(sql`ARRAY['.pdf', '.docx', '.txt', '.md', '.csv', '.log', '.json']::text[]`),
  excludePatterns: text("exclude_patterns")
    .array()
    .notNull()
    .default(sql`ARRAY['node_modules', '.git', '*.tmp']::text[]`),
  maxFileSizeBytes: integer("max_file_size_bytes").notNull().default(26214400),
  indexingFrequency: text("indexing_frequency").notNull().default("manual"),
  lastIndexedAt: timestamp("last_indexed_at", { withTimezone: true }),
  indexedCount: integer("indexed_count").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const indexedDocumentsTable = pgTable(
  "indexed_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    relativePath: text("relative_path").notNull(),
    name: text("name").notNull(),
    extension: text("extension").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    modifiedAt: timestamp("modified_at", { withTimezone: true }).notNull(),
    mimeType: text("mime_type").notNull(),
    content: text("content").notNull().default(""),
    indexedAt: timestamp("indexed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("indexed_documents_relative_path_unique").on(table.relativePath),
    index("indexed_documents_search_gin_idx").using(
      "gin",
      sql`to_tsvector('english', ${table.name} || ' ' || ${table.content})`,
    ),
    index("indexed_documents_modified_at_idx").on(table.modifiedAt),
    index("indexed_documents_extension_idx").on(table.extension),
  ],
);

export const insertDocumentIndexerConfigSchema = createInsertSchema(
  documentIndexerConfigTable,
).omit({ updatedAt: true });
export const insertIndexedDocumentSchema = createInsertSchema(
  indexedDocumentsTable,
).omit({ id: true, indexedAt: true });

export type InsertDocumentIndexerConfig = z.infer<
  typeof insertDocumentIndexerConfigSchema
>;
export type DocumentIndexerConfig =
  typeof documentIndexerConfigTable.$inferSelect;
export type InsertIndexedDocument = z.infer<
  typeof insertIndexedDocumentSchema
>;
export type IndexedDocument = typeof indexedDocumentsTable.$inferSelect;
