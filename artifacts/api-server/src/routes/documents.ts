import { Router, type IRouter } from "express";
import { readFile } from "node:fs/promises";
import { createTransport } from "nodemailer";
import sanitizeHtml from "sanitize-html";
import mammoth from "mammoth";
import { and, count, desc, eq, gte, ilike, lte, sql, sum } from "drizzle-orm";
import {
  db,
  documentIndexerConfigTable,
  indexedDocumentsTable,
} from "@workspace/db";
import {
  EmailDocumentBody,
  EmailDocumentParams,
  EmailDocumentResponse,
  GetDocumentContentParams,
  GetDocumentContentResponse,
  GetDocumentIndexStatusResponse,
  GetDocumentParams,
  GetDocumentPreviewParams,
  GetDocumentPreviewResponse,
  GetDocumentResponse,
  GetDocumentStatsResponse,
  GetIndexerConfigResponse,
  SaveIndexerConfigBody,
  SaveIndexerConfigResponse,
  SearchDocumentsQueryParams,
  SearchDocumentsResponse,
  StartDocumentIndexResponse,
  TestDirectoryTargetBody,
  TestDirectoryTargetResponse,
} from "@workspace/api-zod";
import {
  getIndexStatus,
  getIndexerConfig,
  resolveDocumentRoot,
  resolveIndexedFile,
  restoreIndexSchedule,
  startDocumentIndex,
  syncIndexSchedule,
  testDirectoryTarget,
} from "../lib/document-indexer";

const router: IRouter = Router();
const MAX_CONFIG_FILE_SIZE = 100 * 1024 * 1024;
const MAX_EMAIL_ATTACHMENT_SIZE = 20 * 1024 * 1024;
const supportedExtensions = new Set([
  ".pdf",
  ".docx",
  ".txt",
  ".csv",
  ".log",
  ".md",
  ".json",
]);

function documentDto(document: typeof indexedDocumentsTable.$inferSelect) {
  return {
    id: document.id,
    name: document.name,
    relativePath: document.relativePath,
    extension: document.extension,
    sizeBytes: document.sizeBytes,
    modifiedAt: document.modifiedAt,
    mimeType: document.mimeType,
  };
}

function asQueryString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function parseDateFilter(value: string | undefined, inclusiveEnd: boolean): Date | undefined {
  if (!value) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(
      `${value}T${inclusiveEnd ? "23:59:59.999" : "00:00:00.000"}Z`,
    );
  }
  return new Date(value);
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

async function findDocument(id: string) {
  const [document] = await db
    .select()
    .from(indexedDocumentsTable)
    .where(eq(indexedDocumentsTable.id, id))
    .limit(1);
  return document ?? null;
}

router.get("/documents/config", async (_req, res): Promise<void> => {
  const config = await getIndexerConfig();
  res.json(GetIndexerConfigResponse.parse({ config }));
});

router.put("/documents/config", async (req, res): Promise<void> => {
  const parsed = SaveIndexerConfigBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const input = parsed.data;
  const includeExtensions = [
    ...new Set(
      input.includeExtensions.map((extension) => {
        const normalized = extension.trim().toLowerCase();
        return normalized.startsWith(".") ? normalized : `.${normalized}`;
      }),
    ),
  ];
  if (
    includeExtensions.length === 0 ||
    includeExtensions.some((extension) => !supportedExtensions.has(extension))
  ) {
    res.status(400).json({ error: "Choose one or more supported file types." });
    return;
  }
  if (input.maxFileSizeBytes > MAX_CONFIG_FILE_SIZE) {
    res.status(400).json({
      error: "The maximum file size can be no greater than 100 MB.",
    });
    return;
  }

  const targetResult = await testDirectoryTarget(input.rootPath.trim());
  if (!targetResult.accessible) {
    res.status(400).json({ error: targetResult.message });
    return;
  }

  const excludePatterns = input.excludePatterns
    .map((pattern) => pattern.trim())
    .filter(Boolean)
    .slice(0, 100);
  const values = {
    id: 1,
    rootPath: input.rootPath.trim(),
    includeExtensions,
    excludePatterns,
    maxFileSizeBytes: input.maxFileSizeBytes,
    indexingFrequency: input.indexingFrequency,
    updatedAt: new Date(),
  };
  const [config] = await db
    .insert(documentIndexerConfigTable)
    .values(values)
    .onConflictDoUpdate({
      target: documentIndexerConfigTable.id,
      set: {
        rootPath: values.rootPath,
        includeExtensions: values.includeExtensions,
        excludePatterns: values.excludePatterns,
        maxFileSizeBytes: values.maxFileSizeBytes,
        indexingFrequency: values.indexingFrequency,
        updatedAt: values.updatedAt,
      },
    })
    .returning();

  syncIndexSchedule(input.indexingFrequency);
  res.json(SaveIndexerConfigResponse.parse(config));
});

router.post("/documents/test-target", async (req, res): Promise<void> => {
  const parsed = TestDirectoryTargetBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const result = await testDirectoryTarget(parsed.data.rootPath);
  res.json(TestDirectoryTargetResponse.parse(result));
});

router.post("/documents/index", async (_req, res): Promise<void> => {
  const result = await startDocumentIndex();
  res.status(202).json(StartDocumentIndexResponse.parse(result));
});

router.get("/documents/index/status", (_req, res): void => {
  res.json(GetDocumentIndexStatusResponse.parse(getIndexStatus()));
});

router.get("/documents/stats", async (_req, res): Promise<void> => {
  const [totals] = await db
    .select({
      totalDocuments: count(),
      totalBytes: sum(indexedDocumentsTable.sizeBytes),
    })
    .from(indexedDocumentsTable);
  const typeCounts = await db
    .select({
      extension: indexedDocumentsTable.extension,
      count: count(),
    })
    .from(indexedDocumentsTable)
    .groupBy(indexedDocumentsTable.extension)
    .orderBy(desc(count()));
  res.json(
    GetDocumentStatsResponse.parse({
      totalDocuments: totals.totalDocuments,
      totalBytes: Number(totals.totalBytes || 0),
      typeCounts,
    }),
  );
});

router.get("/documents/search", async (req, res): Promise<void> => {
  const query = {
    q: asQueryString(req.query.q),
    mode: asQueryString(req.query.mode),
    extension: asQueryString(req.query.extension),
    modifiedAfter: parseDateFilter(asQueryString(req.query.modifiedAfter), false),
    modifiedBefore: parseDateFilter(asQueryString(req.query.modifiedBefore), true),
    minSizeBytes: asQueryString(req.query.minSizeBytes),
    maxSizeBytes: asQueryString(req.query.maxSizeBytes),
    limit: asQueryString(req.query.limit),
  };
  const parsed = SearchDocumentsQueryParams.safeParse(query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const filters = [];
  const searchTerm = parsed.data.q?.trim();
  if (parsed.data.extension) {
    const normalizedExtension = parsed.data.extension.startsWith(".")
      ? parsed.data.extension.toLowerCase()
      : `.${parsed.data.extension.toLowerCase()}`;
    filters.push(eq(indexedDocumentsTable.extension, normalizedExtension));
  }
  if (parsed.data.modifiedAfter) {
    filters.push(gte(indexedDocumentsTable.modifiedAt, parsed.data.modifiedAfter));
  }
  if (parsed.data.modifiedBefore) {
    filters.push(lte(indexedDocumentsTable.modifiedAt, parsed.data.modifiedBefore));
  }
  if (parsed.data.minSizeBytes !== undefined) {
    filters.push(gte(indexedDocumentsTable.sizeBytes, parsed.data.minSizeBytes));
  }
  if (parsed.data.maxSizeBytes !== undefined) {
    filters.push(lte(indexedDocumentsTable.sizeBytes, parsed.data.maxSizeBytes));
  }

  if (searchTerm) {
    if (parsed.data.mode === "filename") {
      filters.push(ilike(indexedDocumentsTable.name, `%${escapeLike(searchTerm)}%`));
    } else {
      filters.push(
        sql`to_tsvector('english', ${indexedDocumentsTable.name} || ' ' || ${indexedDocumentsTable.content}) @@ websearch_to_tsquery('english', ${searchTerm})`,
      );
    }
  }

  const where = filters.length ? and(...filters) : undefined;
  const snippet =
    searchTerm && parsed.data.mode === "content"
      ? sql<string>`ts_headline('english', ${indexedDocumentsTable.content}, websearch_to_tsquery('english', ${searchTerm}), 'StartSel=<mark>, StopSel=</mark>, MaxWords=24, MinWords=8, ShortWord=2')`
      : searchTerm
        ? sql<string>`${indexedDocumentsTable.name}`
        : sql<string>`left(${indexedDocumentsTable.content}, 220)`;

  const [totalRows, documents] = await Promise.all([
    db
      .select({ totalCount: count() })
      .from(indexedDocumentsTable)
      .where(where),
    db
      .select({
        id: indexedDocumentsTable.id,
        name: indexedDocumentsTable.name,
        relativePath: indexedDocumentsTable.relativePath,
        extension: indexedDocumentsTable.extension,
        sizeBytes: indexedDocumentsTable.sizeBytes,
        modifiedAt: indexedDocumentsTable.modifiedAt,
        mimeType: indexedDocumentsTable.mimeType,
        snippet,
      })
      .from(indexedDocumentsTable)
      .where(where)
      .orderBy(desc(indexedDocumentsTable.modifiedAt))
      .limit(parsed.data.limit),
  ]);

  res.json(
    SearchDocumentsResponse.parse({
      results: documents,
      totalCount: totalRows[0]?.totalCount ?? 0,
    }),
  );
});

router.get("/documents/:id/preview", async (req, res): Promise<void> => {
  const params = GetDocumentPreviewParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const document = await findDocument(params.data.id);
  if (!document) {
    res.status(404).json({ error: "Document not found." });
    return;
  }

  try {
    const file = await resolveIndexedFile(document.relativePath);
    let kind: "text" | "pdf" | "docx" | "unsupported" = "unsupported";
    let content = "";

    if (document.extension === ".pdf") {
      kind = "pdf";
    } else if (document.extension === ".docx") {
      kind = "docx";
      const html = await mammoth.convertToHtml({ path: file.absolutePath });
      content = sanitizeHtml(html.value, {
        allowedTags: [
          "a", "blockquote", "br", "em", "h1", "h2", "h3", "h4",
          "li", "ol", "p", "strong", "table", "tbody", "td", "th",
          "thead", "tr", "u", "ul",
        ],
        allowedAttributes: { a: ["href", "title"] },
        allowedSchemes: ["http", "https", "mailto"],
      });
    } else if (
      [".txt", ".md", ".csv", ".log", ".json"].includes(document.extension)
    ) {
      kind = "text";
      content = (await readFile(file.absolutePath, "utf8"))
        .replaceAll("\u0000", "")
        .slice(0, 2_000_000);
    }

    const contentUrl = `/api/documents/${encodeURIComponent(document.id)}/content`;
    res.json(
      GetDocumentPreviewResponse.parse({
        kind,
        content,
        mimeType: document.mimeType,
        contentUrl,
        downloadUrl: contentUrl,
      }),
    );
  } catch (error) {
    res.status(404).json({
      error:
        error instanceof Error ? error.message : "Document is no longer available.",
    });
  }
});

router.get("/documents/:id/content", async (req, res): Promise<void> => {
  const params = GetDocumentContentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const document = await findDocument(params.data.id);
  if (!document) {
    res.status(404).json({ error: "Document not found." });
    return;
  }

  try {
    const file = await resolveIndexedFile(document.relativePath);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "private, no-store");
    if (document.extension === ".pdf") {
      res.type("application/pdf");
      res.setHeader("Content-Disposition", 'inline; filename="document.pdf"');
    } else {
      res.type("application/octet-stream");
      res.attachment(document.name);
    }
    res.sendFile(file.absolutePath);
  } catch (error) {
    res.status(404).json({
      error:
        error instanceof Error ? error.message : "Document is no longer available.",
    });
  }
});

router.get("/documents/:id", async (req, res): Promise<void> => {
  const params = GetDocumentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const document = await findDocument(params.data.id);
  if (!document) {
    res.status(404).json({ error: "Document not found." });
    return;
  }
  res.json(GetDocumentResponse.parse(documentDto(document)));
});

router.post("/documents/:id/email", async (req, res): Promise<void> => {
  const params = EmailDocumentParams.safeParse(req.params);
  const body = EmailDocumentBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const document = await findDocument(params.data.id);
  if (!document) {
    res.status(404).json({ error: "Document not found." });
    return;
  }

  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const password = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || user;
  if (!host || !user || !password || !from) {
    res.status(503).json({
      sent: false,
      message: "Email delivery is not configured. Add SMTP settings to enable sending.",
    });
    return;
  }

  let filePath: string | undefined;
  if (body.data.deliveryMode === "attachment") {
    try {
      const file = await resolveIndexedFile(document.relativePath);
      if (file.info.size > MAX_EMAIL_ATTACHMENT_SIZE) {
        res.status(413).json({
          sent: false,
          message: "Files over 20 MB cannot be sent as attachments. Choose internal link instead.",
        });
        return;
      }
      filePath = file.absolutePath;
    } catch {
      res.status(404).json({ sent: false, message: "Document is no longer available." });
      return;
    }
  }

  let shareUrl = "";
  if (body.data.deliveryMode === "link") {
    const configuredBase = process.env.APP_BASE_URL;
    const replitDomain = process.env.REPLIT_DOMAINS?.split(",")[0]?.trim();
    const base = configuredBase || (replitDomain ? `https://${replitDomain}` : "");
    if (!base) {
      res.status(503).json({
        sent: false,
        message: "Set APP_BASE_URL to enable email links.",
      });
      return;
    }
    try {
      shareUrl = new URL(`/view/${encodeURIComponent(document.id)}`, base).toString();
    } catch {
      res.status(503).json({
        sent: false,
        message: "APP_BASE_URL must be a valid public URL.",
      });
      return;
    }
  }

  const note = body.data.note?.trim();
  const text = [
    note,
    body.data.deliveryMode === "link"
      ? `Open the document: ${shareUrl}`
      : "The requested document is attached.",
  ]
    .filter(Boolean)
    .join("\n\n");
  const transporter = createTransport({
    host,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: { user, pass: password },
  });

  try {
    await transporter.sendMail({
      from,
      to: body.data.recipients.join(", "),
      subject: `Document Share: ${document.name}`,
      text,
      ...(filePath
        ? {
            attachments: [
              {
                filename: document.name,
                path: filePath,
                contentType: document.mimeType,
              },
            ],
          }
        : {}),
    });
    res.json(
      EmailDocumentResponse.parse({
        sent: true,
        message: `Document sent to ${body.data.recipients.length} recipient${body.data.recipients.length === 1 ? "" : "s"}.`,
      }),
    );
  } catch (error) {
    req.log.error({ err: error }, "Document email delivery failed");
    res.status(502).json({
      sent: false,
      message: "Email could not be sent. Check the SMTP settings and try again.",
    });
  } finally {
    transporter.close();
  }
});

void restoreIndexSchedule();

export default router;
