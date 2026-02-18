import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getPageContent } from "@/lib/notes";

export const dynamic = "force-dynamic";

const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 15000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callClaudeWithRetry(
  client: Anthropic,
  params: Anthropic.MessageCreateParams
): Promise<Anthropic.Message> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = (await client.messages.create(params)) as Anthropic.Message;
      return response;
    } catch (err) {
      const isRateLimit =
        err instanceof Error &&
        (err.message.includes("rate_limit") ||
          err.message.includes("429") ||
          (err as { status?: number }).status === 429);
      if (isRateLimit && attempt < MAX_RETRIES) {
        const delay = RETRY_BASE_DELAY_MS * (attempt + 1);
        await sleep(delay);
        continue;
      }
      throw err;
    }
  }
  throw new Error("Max retries exceeded");
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { slugs, context, prompt } = body as { slugs: string[]; context: string; prompt?: string };

    if (!slugs || slugs.length === 0) {
      return NextResponse.json({ error: "No pages selected" }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY not configured" },
        { status: 500 }
      );
    }

    // Read content from each selected page
    const pageContents: { slug: string; title: string; content: string }[] = [];
    for (const slug of slugs) {
      const parts = slug.split("/").filter(Boolean);
      const content = getPageContent(parts);
      const title = parts[parts.length - 1].replace(/-/g, " ");
      pageContents.push({ slug, title, content });
    }

    // Build the combined page content for the prompt
    const pagesText = pageContents
      .map(
        (p, i) =>
          `--- Page ${i + 1}: ${p.title} ---\n${p.content || "(empty page)"}\n`
      )
      .join("\n");

    const defaultInstructions = `Please provide:
1. **Key Patterns & Themes** — Common threads, recurring topics, and shared themes across the pages
2. **Gaps & Missing Information** — What's missing, incomplete, or could be expanded
3. **Opportunities & Insights** — Actionable opportunities, connections between pages, and strategic insights
4. **Proposals** — Concrete recommendations for next steps, improvements, or new directions

Format your response in clean Markdown with clear headings and bullet points.`;

    const userPrompt = prompt
      ? `${context ? `Project context:\n${context}\n\n` : ""}${prompt}\n\nPages content:\n\n${pagesText}`
      : `Analyze the following ${pageContents.length} pages and provide a comprehensive analysis with proposals.\n\n${context ? `Project context provided by the user:\n${context}\n\n` : ""}Pages content:\n\n${pagesText}\n\n${defaultInstructions}`;

    const client = new Anthropic({ apiKey });
    const response = await callClaudeWithRetry(client, {
      model: "claude-sonnet-4-20250514",
      max_tokens: 8192,
      messages: [{ role: "user", content: userPrompt }],
    });

    const analysis =
      response.content[0].type === "text" ? response.content[0].text : "";

    return NextResponse.json({ analysis });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Analysis failed";
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
