import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';
import { log } from './logger';

const bedrock = new BedrockRuntimeClient({});
const MODEL_ID = process.env.AI_MODEL_ID ?? 'us.anthropic.claude-haiku-4-5-20251001-v1:0';

/**
 * Pluggable AI seam. Everything goes through invokeClaude so swapping the model
 * (Haiku primary -> Sonnet fallback, or NVIDIA NIM) is an env/config change only.
 */

export interface ClaudeImage {
  mediaType: 'image/jpeg' | 'image/png';
  dataBase64: string;
}

interface InvokeOptions {
  system?: string;
  userText: string;
  images?: ClaudeImage[];
  maxTokens?: number;
  temperature?: number;
}

type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } };

/** Invoke Claude via Bedrock (Anthropic Messages API). Returns the text output. */
export async function invokeClaude(opts: InvokeOptions): Promise<string> {
  const content: ContentBlock[] = [];
  for (const img of opts.images ?? []) {
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: img.mediaType, data: img.dataBase64 },
    });
  }
  content.push({ type: 'text', text: opts.userText });

  const body = {
    anthropic_version: 'bedrock-2023-05-31',
    max_tokens: opts.maxTokens ?? 2048,
    temperature: opts.temperature ?? 0.3,
    ...(opts.system ? { system: opts.system } : {}),
    messages: [{ role: 'user', content }],
  };

  const res = await bedrock.send(
    new InvokeModelCommand({
      modelId: MODEL_ID,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(body),
    }),
  );

  const decoded = JSON.parse(new TextDecoder().decode(res.body));
  const text: string = decoded?.content?.[0]?.text ?? '';
  log.info('bedrock invoke ok', {
    model: MODEL_ID,
    inputTokens: decoded?.usage?.input_tokens,
    outputTokens: decoded?.usage?.output_tokens,
  });
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
