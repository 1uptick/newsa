/**
 * Gemini AI service — server-only. Uses config.gemini.apiKey from server/config.ts.
 * Do not import this from client code; call POST /api/article/generate instead if needed.
 */

import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { config, isGeminiConfigured } from "./config.js";

const ai = isGeminiConfigured
  ? new GoogleGenAI({ apiKey: config.gemini.apiKey })
  : null;

export const generateArticle = async (
  newsTitle: string,
  newsSummary: string,
  context: string
): Promise<string | null> => {
  if (!ai) return null;
  const prompt = `
    You are a professional financial journalist. 
    Based on the following news title and summary, research and generate a new, in-depth article.
    
    News Title: ${newsTitle}
    News Summary: ${newsSummary}
    Additional Context/User Request: ${context}
    
    The article should be:
    1. Professional and insightful.
    2. Structured with a catchy headline, introduction, several subheadings, and a conclusion.
    3. Formatted in Markdown.
    4. Approximately 600-800 words.
  `;

  try {
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: [{ parts: [{ text: prompt }] }],
    });
    return response.text ?? null;
  } catch (error) {
    console.error("Gemini Error:", error);
    throw error;
  }
};
