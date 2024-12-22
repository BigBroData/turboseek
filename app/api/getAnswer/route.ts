// app/api/getAnswer/route.ts
import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import { z } from "zod";
import { RateLimiter } from "limiter"; // Убедитесь, что установлен @types/limiter
import { OllamaAIStream } from "@/utils/OllamaAIStream";

// 🔒 Строгая схема валидации
const RequestSchema = z.object({
  question: z.string().min(3).max(500),
  sources: z.array(
    z.object({
      url: z.string().url(),
      name: z.string().optional()
    })
  ).max(10)
});

// 🚦 Лимитер запросов
const limiter = new RateLimiter({
  tokensPerInterval: 5,
  interval: "minute"
});

export async function POST(request: Request) {
  const startTime = Date.now();

  try {
    // 1. Валидация входящих данных
    const payload = await request.json();
    const { question, sources } = RequestSchema.parse(payload);

    // 2. Проверка лимита запросов
    await limiter.removeTokens(1);

    // 3. Параллельный сбор контента
    const finalResults = await Promise.allSettled(
      sources.map(async (source) => {
        try {
          const response = await fetchWithTimeout(source.url);
          const html = await response.text();

          // Парсинг контента
          const doc = new JSDOM(html).window.document;
          const parsed = new Readability(doc).parse();

          return {
            ...source,
            fullContent: parsed
              ? cleanText(parsed.textContent || '')
              : "Контент недоступен"
          };
        } catch (error) {
          console.warn(`Ошибка обработки ${source.url}:`, error);
          return { ...source, fullContent: "Не удалось извлечь" };
        }
      })
    );

    // 4. Создание умного промпта
    const mainPrompt = createSmartPrompt(finalResults);

    // 5. Подготовка payload для OllamaAIStream
    const aiStreamPayload = {
      messages: [
        { role: "system", content: mainPrompt },
        { role: "user", content: question }
      ],
      stream: true
    };

    // 6. Вызов OllamaAIStream
    return await OllamaAIStream(new Request(JSON.stringify(aiStreamPayload), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }));

  } catch (error) {
    // 7. Продвинутая обработка ошибок
    return handleError(error, startTime);
  }
}

// 🧩 Вспомогательные функции
function createSmartPrompt(results: any[]): string {
  const validContexts = results
    .filter(r => r.status === 'fulfilled')
    .map(r => r.value.fullContent);

  return `
    Дай экспертный ответ на вопрос:
    Контекст: ${validContexts.join('\n\n')}
    Вопрос: {question}
  `;
}

function handleError(error: unknown, startTime: number) {
  const duration = Date.now() - startTime;

  console.error("🔥 Критическая ошибка:", error);

  if (error instanceof z.ZodError) {
    return new Response(JSON.stringify({
      error: "Некорректный запрос",
      details: error.errors
    }), { status: 400 });
  }

  return new Response("Произошла космическая авария 🛸", {
    status: 500,
    headers: {
      "X-Error-Duration": duration.toString()
    }
  });
}

// 🧼 Функция очистки текста
function cleanText(text: string): string {
  return text
    .trim()
    .replace(/(\n){4,}/g, "\n\n\n")     // Убираем лишние переводы строк
    .replace(/\n\n/g, " ")               // Заменяем двойные переводы на пробелы
    .replace(/ {3,}/g, "  ")             // Normalize пробелов
    .replace(/\t/g, "")                  // Удаляем табуляции
    .replace(/\n+(\s*\n)*/g, "\n")       // Чистим лишние переводы строк
    .substring(0, 20000);                // Ограничиваем длину
}

// 🕰️ Функция запроса с таймаутом
async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeout = 5000  // Увеличил до 5 секунд
): Promise<Response> {
  const controller = new AbortController();
  const { signal } = controller;

  const fetchTimeout = setTimeout(() => {
    controller.abort();
  }, timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 OllamaIntelligentFetcher',
        ...options.headers
      }
    });

    clearTimeout(fetchTimeout);
    return response;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Превышено время ожидания для ${url}`);
    }
    throw error;
  }
}