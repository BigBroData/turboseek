// utils/OllamaAIStream.ts
import { ChatOllama } from "@langchain/community/chat_models/ollama";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { z } from "zod";

// 🔒 Схема валидации
const RequestSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(["user", "system", "assistant"]),
    content: z.string()
  })),
  stream: z.boolean().optional().default(false)
});

// 🚀 Конфигурация Ollama
export const OLLAMA_CONFIG = {
  baseUrl: process.env.OLLAMA_URL || "http://localhost:11434",
  model: process.env.OLLAMA_MODEL || "llama3.1",
  temperature: 0.7,
  maxTokens: 1024
};

export async function OllamaAIStream(request: Request) {
  const encoder = new TextEncoder();

  try {
    // 1. Парсинг payload
    const payload = await request.json();
    const { messages, stream } = RequestSchema.parse(payload);

    // 2. Инициализация модели
    const chatModel = new ChatOllama({
      baseUrl: OLLAMA_CONFIG.baseUrl,
      model: OLLAMA_CONFIG.model,
      temperature: OLLAMA_CONFIG.temperature
    });

    // 3. Создание цепочки
    const prompt = ChatPromptTemplate.fromMessages(messages);
    const chain = prompt.pipe(chatModel).pipe(new StringOutputParser());

    // 4. Генерация ответа с поддержкой стриминга
    if (stream) {
      const readableStream = new ReadableStream({
        async start(controller) {
          try {
            const response = await chain.stream({});

            for await (const chunk of response) {
              const payload = { text: chunk };
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify(payload)}\n\n`)
              );
            }

            controller.close();
          } catch (error) {
            controller.error(error);
          }
        }
      });

      return new Response(readableStream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-store"
        }
      });
    } else {
      // Обычная генерация без стриминга
      const response = await chain.invoke({});

      return new Response(response, {
        headers: {
          "Content-Type": "text/plain",
          "Cache-Control": "no-store"
        }
      });
    }

  } catch (error) {
    console.error("🔥 Ошибка в OllamaAIStream:", error);

    // Улучшенная обработка ошибок
    if (error instanceof z.ZodError) {
      return new Response(JSON.stringify({
        error: "Ошибка валидации",
        details: error.errors
      }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    return new Response("Произошла внутренняя ошибка сервера", {
      status: 500,
      headers: { "Content-Type": "text/plain" }
    });
  }
}
