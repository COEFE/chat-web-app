import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/authenticateRequest";
import OpenAI from "openai";

export async function POST(req: NextRequest) {
  // 1) authenticate user
  const { userId, error } = await authenticateRequest(req);
  if (error) return error;

  // 2) read raw payload
  const { raw } = await req.json();
  if (!raw) {
    return NextResponse.json({ error: "Raw data is required." }, { status: 400 });
  }

  // 3) build AI parsing prompt
  const prompt = `You are a helpful assistant that parses budget data. Each row has a period, description or vendor, and an amount. Please output valid JSON: an array of objects with keys "period" (string), "memo" (string), and "amount" (number). Here is the raw data:\n${raw}`;

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You parse budget data into structured JSON." },
        { role: "user", content: prompt }
      ],
      temperature: 0
    });
    const text = completion.choices[0].message?.content || "";

    // 4) parse AI response
    let items: Array<{ period: string; memo: string; amount: number }>;
    try {
      items = JSON.parse(text);
    } catch {
      return NextResponse.json(
        { error: "AI returned invalid JSON.", text },
        { status: 500 }
      );
    }

    // 5) return structured items
    return NextResponse.json({ items }, { status: 200 });
  } catch (err: any) {
    console.error("[api/budget/parse] Error:", err);
    return NextResponse.json(
      { error: err.message || "Unknown error" },
      { status: 500 }
    );
  }
}
