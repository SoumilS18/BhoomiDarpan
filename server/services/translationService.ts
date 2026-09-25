import { GoogleGenerativeAI } from '@google/generative-ai';
import {
  TranslateTextInput,
  NormalizedTranslationResult,
  TranslationStatus,
} from '../../shared/types';
import { isGeminiConfigured } from '../config/supabase';
import { getIntegrationPolicySync } from './policyEngine';

export interface ITranslationProvider {
  readonly name: string;
  readonly providerId: string;
  translate(input: TranslateTextInput): Promise<NormalizedTranslationResult>;
}

// In-memory translation cache (24 hours TTL)
interface CacheEntry {
  data: NormalizedTranslationResult;
  expiresAt: number;
}
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const translationCache = new Map<string, CacheEntry>();

/**
 * Indian language code to display name mapping
 */
export const INDIAN_LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  hi: 'Hindi',
  mr: 'Marathi',
  ta: 'Tamil',
  te: 'Telugu',
  bn: 'Bengali',
  gu: 'Gujarati',
  kn: 'Kannada',
  ml: 'Malayalam',
  pa: 'Punjabi',
  or: 'Odia',
  ur: 'Urdu',
  as: 'Assamese',
};

/**
 * Offline Passthrough Provider
 * Used when no translation engine is configured or enabled by policy.
 * Transparently returns original text and clearly marks status as 'unavailable'.
 * Never fabricates or misrepresents uncredentialed text as translated.
 */
export class OfflinePassthroughProvider implements ITranslationProvider {
  readonly name = 'Offline Passthrough (No external engine)';
  readonly providerId = 'offline_passthrough';

  async translate(input: TranslateTextInput): Promise<NormalizedTranslationResult> {
    const src = input.source_language || 'en';
    return {
      original_text: input.text,
      translated_text: input.text,
      source_language: src,
      target_language: input.target_language,
      provider: this.providerId,
      status: 'unavailable',
      translation_type: 'untranslated_passthrough',
      disclaimer: 'Untranslated text returned. Translation engine is not active or unconfigured.',
      message: 'Translation engine is unavailable or unconfigured. Original text returned without modification.',
      attribution: 'BhoomiSetu Core (Zero external translation)',
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Bhashini National Language Translation Provider
 * Government of India National Language Translation Mission (MeitY) ULCA Dhruva pipeline.
 * Specialized for 22 scheduled Indian languages and statutory e-Governance terminology.
 * Requires BHASHINI_API_KEY and BHASHINI_USER_ID.
 */
export class BhashiniTranslationProvider implements ITranslationProvider {
  readonly name = 'Bhashini (National Language Translation Mission - MeitY)';
  readonly providerId = 'bhashini';
  private endpoint = 'https://dhruva-api.bhashini.gov.in/services/inference/pipeline';
  private timeoutMs = 8000;

  async translate(input: TranslateTextInput): Promise<NormalizedTranslationResult> {
    const src = input.source_language || 'en';
    const tgt = input.target_language;
    const apiKey = process.env.BHASHINI_API_KEY;
    const userId = process.env.BHASHINI_USER_ID;

    // Check credentials
    if (!apiKey || !userId || apiKey.includes('your-bhashini-api-key') || userId.includes('your-bhashini-user-id')) {
      return {
        original_text: input.text,
        translated_text: input.text,
        source_language: src,
        target_language: tgt,
        provider: this.providerId,
        status: 'not_configured',
        translation_type: 'untranslated_passthrough',
        disclaimer: 'Machine translation unconfigured. Original statutory text preserved.',
        message: 'Bhashini credentials (BHASHINI_API_KEY / BHASHINI_USER_ID) not configured. Original text returned.',
        attribution: 'ULCA / Bhashini (MeitY, Govt of India) - Unconfigured',
        timestamp: new Date().toISOString(),
      };
    }

    const startTime = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const payload = {
        pipelineTasks: [
          {
            taskType: 'translation',
            config: {
              language: {
                sourceLanguage: src,
                targetLanguage: tgt,
              },
            },
          },
        ],
        inputData: {
          input: [{ source: input.text }],
        },
      };

      const res = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': apiKey,
          'User-Id': userId,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!res.ok) {
        throw new Error(`Bhashini API returned HTTP ${res.status}: ${res.statusText}`);
      }

      const data = (await res.json()) as any;
      const targetOutput = data?.pipelineResponse?.[0]?.output?.[0]?.target;

      if (!targetOutput || typeof targetOutput !== 'string') {
        throw new Error('Bhashini returned unexpected response structure.');
      }

      return {
        original_text: input.text,
        translated_text: targetOutput.trim(),
        source_language: src,
        target_language: tgt,
        provider: this.providerId,
        status: 'translated',
        translation_type: 'machine_translation',
        disclaimer: 'Automated machine translation via Government of India Bhashini (MeitY ULCA). For administrative guidance; not a certified statutory translation under the Indian Evidence Act.',
        latency_ms: Date.now() - startTime,
        attribution: 'Translation powered by Bhashini (National Language Translation Mission, MeitY, Govt of India)',
        timestamp: new Date().toISOString(),
      };
    } catch (err: any) {
      clearTimeout(timer);
      console.warn(`[BhashiniTranslationProvider] Translation failed: ${err.message}`);
      return {
        original_text: input.text,
        translated_text: input.text,
        source_language: src,
        target_language: tgt,
        provider: this.providerId,
        status: 'provider_error',
        translation_type: 'untranslated_passthrough',
        disclaimer: 'Machine translation failed. Original statutory text preserved.',
        message: `Bhashini API error: ${err.message}. Original text preserved.`,
        attribution: 'ULCA / Bhashini (MeitY, Govt of India)',
        timestamp: new Date().toISOString(),
      };
    }
  }
}

/**
 * Google Gemini Translation Provider
 * Uses Gemini Flash for high-fidelity translation of statutory legal notices,
 * valuation reports, and land revenue terminology into Indian regional languages.
 * Requires GEMINI_API_KEY.
 */
export class GeminiTranslationProvider implements ITranslationProvider {
  readonly name = 'Google Gemini 3.6 Flash (Statutory Multilingual Translation)';
  readonly providerId = 'gemini';
  private timeoutMs = 12000;

  async translate(input: TranslateTextInput): Promise<NormalizedTranslationResult> {
    const src = input.source_language || 'en';
    const tgt = input.target_language;

    if (!isGeminiConfigured) {
      return {
        original_text: input.text,
        translated_text: input.text,
        source_language: src,
        target_language: tgt,
        provider: this.providerId,
        status: 'not_configured',
        translation_type: 'untranslated_passthrough',
        disclaimer: 'AI translation engine unconfigured. Original statutory text preserved.',
        message: 'GEMINI_API_KEY not configured. Original text returned.',
        attribution: 'Google Gemini 3.6 Flash - Unconfigured',
        timestamp: new Date().toISOString(),
      };
    }

    const startTime = Date.now();
    const apiKey = process.env.GEMINI_API_KEY!;
    const genAI = new GoogleGenerativeAI(apiKey);
    const targetName = INDIAN_LANGUAGE_NAMES[tgt] || tgt;
    const sourceName = INDIAN_LANGUAGE_NAMES[src] || src;

    const domainNote = input.domain === 'land_revenue' || input.domain === 'legal'
      ? 'Ensure strict fidelity to statutory land acquisition terms under the RFCTLARR Act 2013, cadastral survey identifiers, Khasra numbers, and monetary compensation figures.'
      : 'Maintain statutory clarity and objective official tone.';

    const prompt = `You are an expert bilingual Indian land acquisition legal linguist for BhoomiSetu.
Translate the following statutory text from ${sourceName} to ${targetName}.
${domainNote}

Text to translate:
"${input.text}"

Output strictly the translated text only, without conversational introduction, markdown quotes, or notes.`;

    try {
      const candidateModels = [process.env.GEMINI_MODEL || 'gemini-2.5-flash', 'gemini-flash-latest'].filter(Boolean);
      let translatedText = '';
      let lastErr: any = null;

      for (const modelName of candidateModels) {
        try {
          const model = genAI.getGenerativeModel({ model: modelName });
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), this.timeoutMs);

          const resultPromise = model.generateContent({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
          });

          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error('Gemini translation timed out')), this.timeoutMs);
          });

          const result = await Promise.race([resultPromise, timeoutPromise]);
          clearTimeout(timer);

          const rawText = result.response.text();
          if (rawText && rawText.trim() !== '') {
            translatedText = rawText.trim();
            break;
          }
        } catch (err: any) {
          lastErr = err;
        }
      }

      if (!translatedText) {
        throw lastErr || new Error('Gemini translation returned empty content');
      }

      return {
        original_text: input.text,
        translated_text: translatedText,
        source_language: src,
        target_language: tgt,
        provider: this.providerId,
        status: 'translated',
        translation_type: 'ai_assisted_translation',
        disclaimer: 'AI-assisted statutory translation powered by Google Gemini. For administrative guidance; not a certified statutory translation under the Indian Evidence Act.',
        latency_ms: Date.now() - startTime,
        attribution: 'Translation powered by Google Gemini 3.6 Flash',
        timestamp: new Date().toISOString(),
      };
    } catch (err: any) {
      console.warn(`[GeminiTranslationProvider] Translation failed: ${err.message}`);
      return {
        original_text: input.text,
        translated_text: input.text,
        source_language: src,
        target_language: tgt,
        provider: this.providerId,
        status: 'provider_error',
        translation_type: 'untranslated_passthrough',
        disclaimer: 'AI translation error encountered. Original statutory text preserved.',
        message: `Gemini translation error: ${err.message}. Original text returned.`,
        attribution: 'Google Gemini - Failed',
        timestamp: new Date().toISOString(),
      };
    }
  }
}

/**
 * Universal Translation Service Manager
 * Enforces statutory integration policy, input sanitization, translation caching,
 * and graceful fallback to offline passthrough.
 */
export class TranslationService {
  private bhashiniProvider = new BhashiniTranslationProvider();
  private geminiProvider = new GeminiTranslationProvider();
  private passthroughProvider = new OfflinePassthroughProvider();

  /**
   * Translate text based on configured statutory IntegrationPolicy
   */
  async translate(input: TranslateTextInput): Promise<NormalizedTranslationResult> {
    if (!input.text || typeof input.text !== 'string' || !input.text.trim()) {
      throw new Error('Text to translate must be a non-empty string.');
    }
    if (!input.target_language || typeof input.target_language !== 'string') {
      throw new Error('Target language code must be provided (e.g., "hi", "mr", "en").');
    }

    const trimmedText = input.text.trim();
    const src = (input.source_language || 'en').toLowerCase().trim();
    const tgt = input.target_language.toLowerCase().trim();

    // If source and target language are identical, return immediate passthrough
    if (src === tgt) {
      return {
        original_text: trimmedText,
        translated_text: trimmedText,
        source_language: src,
        target_language: tgt,
        provider: 'identity',
        status: 'translated',
        translation_type: 'identity',
        disclaimer: 'Source and target languages are identical; original statutory text.',
        attribution: 'Identity (Source and target languages are identical)',
        timestamp: new Date().toISOString(),
      };
    }

    const cacheKey = `${src}->${tgt}:${trimmedText}`;
    const cached = translationCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    const policy = getIntegrationPolicySync();
    let result: NormalizedTranslationResult;

    if (policy.translation_provider === 'bhashini') {
      result = await this.bhashiniProvider.translate({ ...input, text: trimmedText });
    } else if (policy.translation_provider === 'gemini') {
      result = await this.geminiProvider.translate({ ...input, text: trimmedText });
    } else {
      result = await this.passthroughProvider.translate({ ...input, text: trimmedText });
    }

    // Only cache successful or intentional translations (do not cache transient provider errors)
    if (result.status === 'translated' || result.status === 'unavailable' || result.status === 'not_configured') {
      translationCache.set(cacheKey, {
        data: result,
        expiresAt: Date.now() + CACHE_TTL_MS,
      });
    }

    return result;
  }

  /**
   * Clear translation cache (for testing)
   */
  clearCache(): void {
    translationCache.clear();
  }
}

export const translationService = new TranslationService();
