# Providers

Fluxora supports four builtin AI providers plus arbitrary custom OpenAI-compatible endpoints.

## Builtin Providers

| Provider | API Kind | Base URL | Models |
|---|---|---|---|
| OpenAI | openai | `https://api.openai.com/v1` | gpt-4o, gpt-4o-mini, gpt-4-turbo, o1-mini |
| Anthropic | anthropic | `https://api.anthropic.com` | claude-sonnet-4-20250514, claude-3-5-haiku-20241022 |
| Gemini | gemini | `https://generativelanguage.googleapis.com` | gemini-2.0-flash, gemini-1.5-pro |
| Ollama | openai | `http://localhost:11434/v1` | llama3.2, mistral, codellama (configurable) |

Builtin providers are synced to the database on startup via `syncBuiltinProvidersToPresets()`. Users fill in API keys; Ollama requires no key.

## Provider Type Detection

`detect.ts` classifies providers by URL pattern:
- `api.openai.com` → openai
- `api.anthropic.com` → anthropic
- `generativelanguage.googleapis.com` / `aiplatform.googleapis.com` → gemini
- `localhost:11434` / `127.0.0.1:11434` → openai (Ollama's OpenAI-compatible API)
- Everything else → openai (generic OpenAI-compatible)

## Capabilities

Each provider stores a `capabilities` JSON blob:

```typescript
interface ProviderCapabilities {
  apiKind: 'openai' | 'anthropic' | 'gemini'
  detectedType: string
  supportsStreaming: boolean
  supportsVision: boolean
  contextWindow?: number
  limits?: { maxTokens?: number; maxImages?: number }
  detectedAt: string
}
```

Capabilities are populated during connection testing and model listing.

## Auto-Routing

When `AppSettings.autoRoute` is enabled, `ai.autoRoute` selects the best provider+model for a request based on:
1. Task type (coding → models with strong code performance; creative → creative models; analysis → reasoning models)
2. Available providers (enabled + has key)
3. Cost optimization (prefer cheaper models for simple tasks)
4. Context window requirements (long conversations → larger context models)

## Model Listing

`providers.listModels(providerId)` fetches available models:
- OpenAI: `GET /v1/models`
- Anthropic: hardcoded catalog (no listing endpoint)
- Gemini: `GET /v1beta/models`
- Ollama: `GET /api/tags`

`refreshModels` updates the provider's model list from the live API.

## Connection Testing

Three levels:
1. `test(providerId)` — quick reachability check
2. `testConnection(providerId)` — send a minimal completion request
3. `testConfig(config)` — test unsaved provider configuration

## Streaming

All providers support streaming via SSE (Server-Sent Events). The `ai.streamChat` IPC sends chunks to the renderer via `ai:on-chunk` events, with `ai:on-done` and `ai:on-error` terminal events. The renderer can call `ai.stop` to abort mid-stream.

## Adding a Custom Provider

Any OpenAI-compatible API works:
1. Settings → Providers → Add Custom
2. Set base URL, API key, and model list
3. Type defaults to `openai` (works for OpenRouter, Together, Groq, LM Studio, vLLM, etc.)

## Key Security

API keys are stored in the `providers` table. The preload API exposes `hasKey` (boolean) rather than the raw key to the renderer. The key is only read in the main process when making API calls. See SECURITY.md for planned OS-keychain migration.
