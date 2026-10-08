import { createHash, randomUUID } from "node:crypto";
import {
  appendFile,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { globalConfigPath } from "../../config.js";
import { EngineError, type EngineErrorCode } from "../../errors.js";
import type { Content, TextContent } from "../../types.js";
import { traceHeaders } from "../../../observability/trace-context.js";
import type { GoogleEmbeddingCatalogEntry } from "../catalog.js";
import {
  BaseEmbeddingModel,
  type CreateEmbeddingModelOptions,
  type EmbeddingModelInfo,
  type EmbeddingResult,
  type NormalizedEmbeddingOptions,
} from "../embeddings.js";

const REQUEST_TIMEOUT_MS = 60_000;

type GoogleDependencies = { fetch: typeof globalThis.fetch };

export class GeminiEmbedding2Model extends BaseEmbeddingModel {
  readonly info: EmbeddingModelInfo;
  private readonly entry: GoogleEmbeddingCatalogEntry;
  private readonly apiKey: string;
  private readonly endpoint: string;
  private readonly dependencies: GoogleDependencies;

  constructor(
    entry: GoogleEmbeddingCatalogEntry,
    options: CreateEmbeddingModelOptions,
    dependencies: Partial<GoogleDependencies> = {},
  ) {
    super();
    this.entry = entry;
    this.endpoint = options.endpoint?.trim() || entry.defaultEndpoint;
    this.apiKey = options.apiKey?.trim() ?? "";
    this.dependencies = {
      fetch: (...args) => globalThis.fetch(...args),
      ...dependencies,
    };
    this.info = {
      reference: entry.reference,
      provider: entry.provider,
      name: entry.model,
      dimension: entry.dimension,
      metric: entry.metric,
      endpoint: this.endpoint,
      defaultConcurrency: 1,
      inputKinds: ["text"],
      limits: {
        maxBatchSize: entry.maxBatchSize,
        maxInputTokens: entry.maxInputTokens,
      },
    };
    if (!this.apiKey) {
      throw new EngineError("Gemini Embedding 2 requires an API key", {
        code: this.errorCode("MISSING_API_KEY"),
        context: `model=${entry.reference}\nhint=Set GEMINI_API_KEY_FILE, GEMINI_API_KEY, or ZVEC_GREP_API_KEY; do not store credentials in ${globalConfigPath()}.`,
      });
    }
  }

  protected async doEmbed(
    contents: readonly Content[],
    options: NormalizedEmbeddingOptions,
  ): Promise<EmbeddingResult> {
    options.signal?.throwIfAborted();
    const texts = (contents as readonly TextContent[]).map(({ text }) =>
      options.purpose === "query"
        ? `task: code retrieval | query: ${text}`
        : `title: none | text: ${text}`,
    );
    const pending = new Map<string, Promise<number[]>>();
    const vectors = await Promise.all(
      texts.map((text) => {
        const inputSha256 = sha256(text);
        const key = sha256(
          `${this.endpoint}\0${this.entry.model}\0${this.entry.dimension}\0${inputSha256}`,
        );
        const existing = pending.get(key);
        if (existing) {
          return existing.then(async (values) => {
            await recordUsage(null, {
              model: this.entry.model,
              purpose: options.purpose,
              durationMs: 0,
              dimension: values.length,
              inputSha256,
              cacheHit: true,
            });
            return values;
          });
        }
        const embedding = this.embedCached(text, inputSha256, key, options);
        pending.set(key, embedding);
        return embedding;
      }),
    );
    return { vectors, truncated: [] };
  }

  private async embedCached(
    text: string,
    inputSha256: string,
    key: string,
    options: NormalizedEmbeddingOptions,
  ): Promise<number[]> {
    const cacheRoot =
      options.purpose === "document"
        ? process.env.ZVEC_GREP_EMBEDDING_CACHE?.trim()
        : undefined;
    const cachePath = cacheRoot
      ? join(cacheRoot, key.slice(0, 2), `${key}.json`)
      : undefined;
    if (cachePath) {
      const cached = await readCache(cachePath, {
        model: this.entry.model,
        dimension: this.entry.dimension,
        inputSha256,
      });
      if (cached) {
        await recordUsage(null, {
          model: this.entry.model,
          purpose: options.purpose,
          durationMs: 0,
          dimension: cached.length,
          inputSha256,
          cacheHit: true,
        });
        return cached;
      }
    }

    const values = await this.embedOne(text, inputSha256, options);
    if (cachePath) {
      await writeCache(cachePath, {
        model: this.entry.model,
        dimension: this.entry.dimension,
        inputSha256,
        values,
      });
    }
    return values;
  }

  private async embedOne(
    text: string,
    inputSha256: string,
    options: NormalizedEmbeddingOptions,
  ): Promise<number[]> {
    options.signal?.throwIfAborted();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const relayAbort = () => controller.abort();
    options.signal?.addEventListener("abort", relayAbort, { once: true });
    const startedAt = Date.now();
    try {
      const response = await this.dependencies.fetch(this.endpoint, {
        method: "POST",
        headers: {
          ...traceHeaders(),
          "Content-Type": "application/json",
          "x-goog-api-key": this.apiKey,
        },
        body: JSON.stringify({
          model: `models/${this.entry.model}`,
          content: { parts: [{ text }] },
        }),
        signal: controller.signal,
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        throw new EngineError("Gemini Embedding 2 request returned an error", {
          code: this.errorCode("API_ERROR"),
          context: `model=${this.info.reference} status=${response.status}`,
        });
      }
      const values = embeddingValues(body, this.entry.dimension);
      await recordUsage(body, {
        model: this.entry.model,
        purpose: options.purpose,
        durationMs: Date.now() - startedAt,
        dimension: values.length,
        inputSha256,
        cacheHit: false,
      });
      return values;
    } catch (cause) {
      options.signal?.throwIfAborted();
      if (cause instanceof EngineError) throw cause;
      throw new EngineError("Gemini Embedding 2 request failed", {
        code: this.errorCode("REQUEST_FAILED"),
        context: `model=${this.info.reference} endpoint=${this.endpoint} timeoutMs=${REQUEST_TIMEOUT_MS}`,
        cause,
      });
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", relayAbort);
    }
  }

  private errorCode(suffix: string): EngineErrorCode {
    return `ZVEC_GREP.ENGINE.MODELS.GEMINI_EMBEDDING_2_${suffix}`;
  }
}

function embeddingValues(body: unknown, dimension: number): number[] {
  if (
    !isRecord(body) ||
    !isRecord(body.embedding) ||
    !Array.isArray(body.embedding.values) ||
    body.embedding.values.length !== dimension ||
    !body.embedding.values.every(Number.isFinite)
  ) {
    throw new EngineError(
      "Gemini Embedding 2 response did not include an embedding",
      {
        code: "ZVEC_GREP.ENGINE.MODELS.GEMINI_EMBEDDING_2_MISSING_EMBEDDING",
      },
    );
  }
  return body.embedding.values as number[];
}

async function recordUsage(
  body: unknown,
  event: {
    model: string;
    purpose: string;
    durationMs: number;
    dimension: number;
    inputSha256: string;
    cacheHit: boolean;
  },
): Promise<void> {
  const path = process.env.ZVEC_GREP_USAGE_LOG?.trim();
  if (!path) return;
  const raw =
    isRecord(body) && isRecord(body.usageMetadata) ? body.usageMetadata : {};
  const usageMetadata = Object.fromEntries(
    ["promptTokenCount", "totalTokenCount"].flatMap((key) =>
      typeof raw[key] === "number" && Number.isFinite(raw[key])
        ? [[key, raw[key]]]
        : [],
    ),
  );
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await appendFile(path, `${JSON.stringify({ ...event, usageMetadata })}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
}

type CacheRecord = {
  model: string;
  dimension: number;
  inputSha256: string;
  values: number[];
};

async function readCache(
  path: string,
  expected: Omit<CacheRecord, "values">,
): Promise<number[] | undefined> {
  let bytes: string;
  try {
    bytes = await readFile(path, "utf8");
  } catch (cause) {
    if (isNodeError(cause) && cause.code === "ENOENT") return undefined;
    throw cause;
  }
  const value: unknown = JSON.parse(bytes);
  if (
    !isRecord(value) ||
    value.model !== expected.model ||
    value.dimension !== expected.dimension ||
    value.inputSha256 !== expected.inputSha256 ||
    !Array.isArray(value.values) ||
    value.values.length !== expected.dimension ||
    !value.values.every(Number.isFinite)
  ) {
    throw new EngineError("Gemini Embedding 2 cache entry is invalid", {
      code: "ZVEC_GREP.ENGINE.MODELS.GEMINI_EMBEDDING_2_INVALID_CACHE",
      context: `model=${expected.model} dimension=${expected.dimension} inputSha256=${expected.inputSha256}`,
    });
  }
  return value.values as number[];
}

async function writeCache(path: string, record: CacheRecord): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(record), {
      encoding: "utf8",
      mode: 0o600,
    });
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNodeError(value: unknown): value is NodeJS.ErrnoException {
  return value instanceof Error && "code" in value;
}
