# AI SDK behind one `Ai` port, not the Anthropic SDK directly

Every model call (Gemini, with Groq as fallback, for classification, import and chat; Groq Whisper for speech) goes
through `apps/api/src/ai/provider.ts`, built on the Vercel AI SDK (`@ai-sdk/google`,
`@ai-sdk/groq`) with a scripted fake for tests. When a Gemini call throws, `wrapLanguageModel` middleware
runs the same call once on the Groq fallback model. The user asked to switch providers with little
effort: with the AI SDK that is a model-factory change, while the official `@anthropic-ai/sdk`
would mean owning a tool loop and a stream encoder and writing a new adapter per provider. The
same port shape already runs in `my-holy-attractions-map`.

## Considered Options

- Official Anthropic SDK behind our own port — first-party and preferred by the `claude-api`
  skill, but ~200 lines of loop/streaming code we would own, and no second provider for free.
