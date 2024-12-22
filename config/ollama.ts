// config/ollama.ts
import { z } from "zod";

// Схема валидации конфигурации с использованием Zod
export const OllamaConfigSchema = z.object({
  baseUrl: z.string().url().default("http://localhost:11434"),
  model: z.string().default("llama3.1"),
  temperature: z.number().min(0).max(1).default(0.7),
  maxTokens: z.number().positive().default(1024)
});

// Создаем тип на основе схемы Zod
export type OllamaConfig = z.infer<typeof OllamaConfigSchema>;

// Функция для создания и валидации конфигурации
export function createOllamaConfig(
  customConfig?: Partial<OllamaConfig>
): OllamaConfig {
  return OllamaConfigSchema.parse({
    baseUrl: process.env.OLLAMA_URL,
    model: process.env.OLLAMA_MODEL,
    ...customConfig
  });
}

// Создаем дефолтную конфигурацию
export const OLLAMA_CONFIG = createOllamaConfig();
