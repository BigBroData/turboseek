import { NextResponse } from "next/server";
import {  ChatOllama } from "@langchain/community/chat_models/ollama";
import { z } from "zod";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { JsonOutputParser } from "@langchain/core/output_parsers";
import { OLLAMA_CONFIG } from "@/config/ollama"; // Используем конфигурацию из правильного места

export async function POST(request: Request) {
  let { question } = await request.json();

  // Схема для валидации результата
  const schema = z.array(z.string()).length(3);

  // Использование fromMessages для создания промпта
  const prompt = ChatPromptTemplate.fromMessages([
    [
      "system",
      `You are a helpful assistant that helps the user to ask related questions, based on user's original question. 
      Please identify worthwhile topics that can be follow-ups, and write 3 questions no longer than 20 words each. 
      Please make sure that specifics, like events, names, locations, are included in follow up questions so they can be asked standalone. 
      For example, if the original question asks about "the Manhattan project", in the follow up question, do not just say "the project", 
      but use the full name "the Manhattan project". Your related questions must be in the same language as the original question.
      
      Please provide these 3 related questions as a JSON array of 3 strings. 
      Do NOT repeat the original question. ONLY return the JSON array.`
    ],
    ["human", "Original Question: {question}"]
  ]);

  // Использование современной конфигурации с форматом JSON
  const chatModel = new ChatOllama({
    baseUrl: OLLAMA_CONFIG.baseUrl,
    model: OLLAMA_CONFIG.model,
    format: "json", // Явное указание формата JSON
    temperature: OLLAMA_CONFIG.temperature
  });

  const outputParser = new JsonOutputParser();

  try {
    // Создание цепочки с использованием pipe
    const chain = prompt.pipe(chatModel).pipe(outputParser);

    // Вызов с передачей вопроса
    const result = await chain.invoke({
      question: question
    });

    // Валидация результата
    const validatedQuestions = schema.parse(result);

    return NextResponse.json(validatedQuestions);
  } catch (error) {
    console.error("Error generating similar questions:", error);

    // Улучшенная обработка ошибок
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: "Invalid response format",
          details: error.errors
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Failed to generate similar questions" },
      { status: 500 }
    );
  }
}