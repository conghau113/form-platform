/**
 * P1 — the AI provider seam.
 *
 * The pipeline talks to LLMs ONLY through this interface, never to a concrete
 * SDK or a hardcoded endpoint — the same injectable philosophy as the renderer's
 * `fetcher` prop. A caller swaps providers (9router for dev/BYOK, OpenAI, Azure,
 * Anthropic, or a deterministic mock in tests) without touching the pipeline.
 *
 * No `react`, no `antd`, no Node-only APIs: this package runs on the server
 * (NestJS) AND in the browser (builder), so it stays dependency-light.
 */

/** A plain text part of a message. */
export interface AiTextContent {
  type: "text";
  text: string;
}

/**
 * An image part for vision models. Provide either a `url` (public or data URL)
 * or raw `base64` plus `mediaType`. Providers map this to their own image shape.
 */
export interface AiImageContent {
  type: "image";
  url?: string;
  base64?: string;
  mediaType?: string;
}

export type AiContent = AiTextContent | AiImageContent;

export type AiRole = "system" | "user" | "assistant";

export interface AiMessage {
  role: AiRole;
  content: AiContent[];
}

export interface AiCompletionRequest {
  messages: AiMessage[];
  /**
   * Optional JSON Schema describing the expected response object. Providers that
   * support structured output (OpenAI `response_format`) constrain to it; others
   * ignore it and rely on the prompt. Never trusted for validation — the pipeline
   * always re-validates the result with Zod.
   */
  jsonSchema?: Record<string, unknown>;
  temperature?: number;
  maxTokens?: number;
}

export interface AiCompletionResult {
  /** Raw assistant text, expected to contain the JSON document. */
  text: string;
}

/** The single seam every provider implements and the pipeline depends on. */
export interface AiProvider {
  complete(req: AiCompletionRequest): Promise<AiCompletionResult>;
}
