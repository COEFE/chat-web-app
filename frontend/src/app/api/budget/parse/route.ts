import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/authenticateRequest";
import OpenAI from "openai";

export async function POST(req: NextRequest) {
  // 1) authenticate user
  const { userId, error } = await authenticateRequest(req);
  if (error) return error;

  // 1b) ensure OpenAI API key is set
  if (!process.env.OPENAI_API_KEY) {
    console.error('[api/budget/parse] Missing OPENAI_API_KEY');
    return NextResponse.json(
      { error: 'OpenAI API key not configured.' },
      { status: 500 }
    );
  }

  // 2) read raw payload
  const { raw } = await req.json();
  console.log(`[api/budget/parse] raw length: ${raw?.length}`);
  if (!raw) {
    return NextResponse.json({ error: "Raw data is required." }, { status: 400 });
  }

  // 3) build AI parsing prompt
  const prompt = `You are a helpful assistant that parses budget data. Each row has a period, description or vendor, and an amount. Please output valid JSON: an array of objects with keys "period" (string), "memo" (string), and "amount" (number). Here is the raw data:\n${raw}`;
  console.log(`[api/budget/parse] prompt sample: ${prompt.slice(0, 100)}...`);

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const model = process.env.OPENAI_MODEL || "gpt-4-1-mini"; // default to GPT-4.1 Mini
    console.log(`[api/budget/parse] using model: ${model}`);
    const completion = await openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: "You parse budget data into structured JSON." },
        { role: "user", content: prompt }
      ],
      temperature: 0
    });
    const text = completion.choices[0].message?.content || "";

    // 4) clean and parse AI response
    // Strip code fences and extract JSON array
    const rawText = text.trim();
    let jsonText = rawText;
    if (rawText.startsWith("```")) {
      jsonText = rawText
        .replace(/```json?\n?/, "")
        .replace(/```$/, "")
        .trim();
    } else {
      const start = rawText.indexOf('[');
      const end = rawText.lastIndexOf(']');
      if (start !== -1 && end !== -1) {
        jsonText = rawText.slice(start, end + 1);
      }
    }
    console.log(`[api/budget/parse] cleaned JSON snippet: ${jsonText.slice(0,100)}...`);
    let items: Array<{ period: string; memo: string; amount: number }>;
    try {
      items = JSON.parse(jsonText);
    } catch (parseErr: any) {
      console.error("[api/budget/parse] JSON parse error:", parseErr);
      return NextResponse.json(
        { error: "AI returned invalid JSON.", raw: text, extracted: jsonText },
        { status: 500 }
      );
    }

    // 5) return structured items
    return NextResponse.json({ items }, { status: 200 });
  } catch (err: any) {
    console.error("[api/budget/parse] Error:", err);
    console.error(`[api/budget/parse] Stack: ${err.stack}`);
    return NextResponse.json(
      { error: err.message || "Unknown error" },
      { status: 500 }
    );
  }
}
