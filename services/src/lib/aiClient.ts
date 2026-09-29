import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';
import { log } from './logger';

const bedrock = new BedrockRuntimeClient({});

/** Default primary model. Amazon Nova Lite: first-party, multimodal, cheap/fast. */
const DEFAULT_MODEL_ID = 'us.amazon.nova-lite-v1:0';

/**
 * Pluggable AI seam. All generation goes through invokeAI so the model is a
 * config choice. Supports two Bedrock families:
 *  - Amazon Nova   (amazon.nova-*)  — primary
 *  - Anthropic Claude (anthropic.*) — env-var fallback
 * Callers can pass a modelId to use per-feature models (e.g. Pro for Quiz-Me).
 */

export interface AIImage {
  mediaType: 'image/jpeg' | 'image/png';
  dataBase64: string;
}

export interface InvokeOptions {
  system?: string;
  userText: string;
  images?: AIImage[];
  maxTokens?: number;
  temperature?: number;
  /** Override the model for this call (per-feature). Falls back to AI_MODEL_ID env. */
  modelId?: string;
}

function isClaude(modelId: string): boolean {
  return modelId.includes('anthropic.');
}

function novaImageFormat(mediaType: string): 'jpeg' | 'png' {
  return mediaType === 'image/png' ? 'png' : 'jpeg';
}

/** Invoke the configured Bedrock model and return its text output. */
export async function invokeAI(opts: InvokeOptions): Promise<string> {
  const modelId = opts.modelId ?? process.env.AI_MODEL_ID ?? DEFAULT_MODEL_ID;
  const maxTokens = opts.maxTokens ?? 2048;
  const temperature = opts.temperature ?? 0.3;

  let body: unknown;
  if (isClaude(modelId)) {
    const content: unknown[] = [];
    for (const img of opts.images ?? []) {
      content.push({
        type: 'image',
        source: { type: 'base64', media_type: img.mediaType, data: img.dataBase64 },
      });
    }
    content.push({ type: 'text', text: opts.userText });
    body = {
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: maxTokens,
      temperature,
      ...(opts.system ? { system: opts.system } : {}),
      messages: [{ role: 'user', content }],
    };
  } else {
    // Amazon Nova (Bedrock Converse-style invoke body).
    const content: unknown[] = [];
    for (const img of opts.images ?? []) {
      content.push({
        image: { format: novaImageFormat(img.mediaType), source: { bytes: img.dataBase64 } },
      });
    }
    content.push({ text: opts.userText });
    body = {
      ...(opts.system ? { system: [{ text: opts.system }] } : {}),
      messages: [{ role: 'user', content }],
      inferenceConfig: { maxTokens, temperature },
    };
  }

  const res = await bedrock.send(
    new InvokeModelCommand({
      modelId,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(body),
    }),
  );

  const decoded = JSON.parse(new TextDecoder().decode(res.body));

  let text: string;
  let usage: unknown;
  if (isClaude(modelId)) {
    text = decoded?.content?.[0]?.text ?? '';
    usage = decoded?.usage;
  } else {
    text = decoded?.output?.message?.content?.[0]?.text ?? '';
    usage = decoded?.usage;
  }

  log.info('bedrock invoke ok', { model: modelId, usage });
  return text;
}

/** Extract the first JSON object from a model response (handles code fences / prose). */
export function parseJsonObject<T>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON object found in model output');
  return JSON.parse(candidate.slice(start, end + 1)) as T;
}
