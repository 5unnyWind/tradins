import OpenAI from "openai";

import { getLLMConfig } from "@/lib/config";

export async function llmComplete(systemPrompt: string, userPrompt: string): Promise<string> {
  const cfg = getLLMConfig();
  if (!cfg.apiKey) {
    throw new Error("LLM disabled: missing TRADINS_API_KEY.");
  }
  const client = new OpenAI({
    apiKey: cfg.apiKey,
    baseURL: cfg.baseUrl,
  });
  const completion = await client.chat.completions.create({
    model: cfg.model,
    temperature: cfg.temperature,
    max_tokens: cfg.maxTokens,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });
  const content = completion.choices[0]?.message?.content?.trim();
  if (!content) throw new Error("LLM returned empty content.");
  return content;
}
