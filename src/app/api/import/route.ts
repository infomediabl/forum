import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { savePageContent, saveImageToPage, createPage } from "@/lib/notes";
import fs from "fs";
import path from "path";

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp"]);
const HTML_EXTENSIONS = new Set([".html", ".htm"]);
const CONCURRENCY = 3;
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 15000;

const LOG_DIR = path.join(process.cwd(), "logs");
const LOG_FILE = path.join(LOG_DIR, "import.log");

function log(message: string) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${message}\n`;
  console.log(`[import] ${message}`);
  try {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(LOG_FILE, line, "utf-8");
  } catch {
    // ignore file write errors
  }
}

function getExtension(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot >= 0 ? filename.slice(dot).toLowerCase() : "";
}

function getBaseName(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot >= 0 ? filename.slice(0, dot) : filename;
}

// Detect actual image MIME type from file magic bytes
function detectMimeType(buffer: Buffer): "image/png" | "image/jpeg" | "image/gif" | "image/webp" | null {
  if (buffer.length < 4) return null;

  // PNG: 89 50 4E 47
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return "image/png";
  }
  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  // GIF: 47 49 46 38
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) {
    return "image/gif";
  }
  // WebP: 52 49 46 46 ... 57 45 42 50
  if (buffer.length >= 12 &&
    buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
    buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) {
    return "image/webp";
  }

  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface FileGroup {
  name: string;
  slug: string;
  htmlFile: File | null;
  imageFiles: File[];
}

function groupFiles(files: File[]): { groups: FileGroup[]; unmatched: string[] } {
  const htmlFiles: File[] = [];
  const imageFiles: File[] = [];

  for (const file of files) {
    const ext = getExtension(file.name);
    if (HTML_EXTENSIONS.has(ext)) {
      htmlFiles.push(file);
    } else if (IMAGE_EXTENSIONS.has(ext)) {
      imageFiles.push(file);
    }
  }

  log(`Grouping: ${htmlFiles.length} HTML files, ${imageFiles.length} image files`);

  const groups: FileGroup[] = [];
  const matchedImages = new Set<string>();

  for (const html of htmlFiles) {
    const baseName = getBaseName(html.name);
    const slug = baseName.replace(/\s+/g, "-");
    const matched: File[] = [];

    for (const img of imageFiles) {
      const imgBase = getBaseName(img.name);
      if (imgBase === baseName || imgBase.startsWith(baseName + "-") || imgBase.startsWith(baseName + "_")) {
        matched.push(img);
        matchedImages.add(img.name);
      }
    }

    log(`Group "${baseName}" → slug="${slug}", ${matched.length} image(s): [${matched.map(f => f.name).join(", ")}]`);
    groups.push({ name: baseName, slug, htmlFile: html, imageFiles: matched });
  }

  const unmatched = imageFiles
    .filter((img) => !matchedImages.has(img.name))
    .map((img) => img.name);

  if (unmatched.length > 0) {
    log(`Unmatched images: [${unmatched.join(", ")}]`);
  }

  return { groups, unmatched };
}

interface ImportResult {
  name: string;
  slug: string;
  success: boolean;
  error?: string;
}

async function callClaudeWithRetry(
  client: Anthropic,
  params: Anthropic.MessageCreateParams,
  progress: string,
  groupName: string
): Promise<Anthropic.Message> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const startTime = Date.now();
      const response = await client.messages.create(params) as Anthropic.Message;
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      log(`${progress} Claude responded in ${elapsed}s — usage: input=${response.usage.input_tokens}, output=${response.usage.output_tokens}, stop=${response.stop_reason}`);
      return response;
    } catch (err) {
      const isRateLimit = err instanceof Error && (
        err.message.includes("rate_limit") ||
        err.message.includes("429") ||
        (err as { status?: number }).status === 429
      );

      if (isRateLimit && attempt < MAX_RETRIES) {
        const delay = RETRY_BASE_DELAY_MS * (attempt + 1);
        log(`${progress} Rate limited for "${groupName}", retry ${attempt + 1}/${MAX_RETRIES} after ${delay / 1000}s...`);
        await sleep(delay);
        continue;
      }
      throw err;
    }
  }
  throw new Error("Max retries exceeded");
}

async function processGroup(
  client: Anthropic,
  group: FileGroup,
  index: number,
  total: number,
  explanation: string
): Promise<ImportResult> {
  const progress = `[${index + 1}/${total}]`;

  if (!group.htmlFile) {
    log(`${progress} SKIP "${group.name}" — no HTML file`);
    return { name: group.name, slug: group.slug, success: false, error: "No HTML file" };
  }

  log(`${progress} Processing "${group.name}"...`);

  const htmlText = await group.htmlFile.text();
  const slug = [group.slug];

  log(`${progress} HTML size: ${htmlText.length} chars`);

  // Build multimodal content blocks
  const contentBlocks: Anthropic.MessageCreateParams["messages"][0]["content"] = [];

  // Read images into buffers (keep for saving later)
  const imageBuffers: { name: string; buffer: Buffer }[] = [];

  for (const imgFile of group.imageFiles) {
    const arrayBuffer = await imgFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    imageBuffers.push({ name: imgFile.name, buffer });

    // Detect actual MIME type from magic bytes, fall back to extension
    const detectedMime = detectMimeType(buffer);
    const ext = getExtension(imgFile.name).slice(1);
    const extMime = ext === "jpg" ? "image/jpeg" : `image/${ext}`;
    const mediaType = detectedMime || extMime;

    if (detectedMime && detectedMime !== extMime) {
      log(`${progress} MIME fix: "${imgFile.name}" extension says ${extMime} but bytes say ${detectedMime}`);
    }

    log(`${progress} Adding image "${imgFile.name}" (${(buffer.length / 1024).toFixed(1)}KB, ${mediaType})`);

    contentBlocks.push({
      type: "image",
      source: {
        type: "base64",
        media_type: mediaType as "image/png" | "image/jpeg" | "image/gif" | "image/webp",
        data: buffer.toString("base64"),
      },
    });
  }

  // Build image reference list for the prompt
  const imageRefs = group.imageFiles
    .map((img) => `- ${img.name} → /api/notes/images/${group.slug}/${img.name}`)
    .join("\n");

  contentBlocks.push({
    type: "text",
    text: `Convert the following HTML into clean, well-styled Markdown.

IMPORTANT RULES:
1. This HTML contains forum posts ordered oldest-first. REVERSE the order so the NEWEST post appears first and the OLDEST post appears last.
2. If images are provided, EMBED them in the markdown content using ![description](url) syntax. Place each image where it is most relevant to the surrounding text (e.g. after stats tables, after layout descriptions, etc.).
3. Use rich text styling throughout:
   - # for the page title, ## for post titles, ### for section headings within posts
   - **Bold** for author names, dates, status labels, key metrics, and important terms
   - Tables for any tabular data (stats, comparisons)
   - > blockquotes for quoted text
   - Horizontal rules (---) between posts
   - Bullet lists and numbered lists where appropriate
   - *Italic* for notes, side comments, and emphasis

${explanation ? `User instructions: ${explanation}\n\n` : ""}${imageRefs ? `Available images — embed these in the content where relevant:\n${imageRefs}\n\n` : ""}HTML content:\n\`\`\`html\n${htmlText}\n\`\`\`

Output ONLY the Markdown content, no wrapping code fences or explanation.`,
  });

  log(`${progress} Calling Claude API...`);

  const response = await callClaudeWithRetry(client, {
    model: "claude-sonnet-4-20250514",
    max_tokens: 8192,
    messages: [{ role: "user", content: contentBlocks }],
  }, progress, group.name);

  const markdown =
    response.content[0].type === "text" ? response.content[0].text : "";

  log(`${progress} Markdown output: ${markdown.length} chars`);

  // Save the page
  createPage(slug);
  savePageContent(slug, markdown);
  log(`${progress} Saved content.md for "${group.slug}"`);

  // Save images
  for (const { name, buffer } of imageBuffers) {
    saveImageToPage(slug, name, buffer);
    log(`${progress} Saved image "${name}" to "${group.slug}/"`);
  }

  log(`${progress} SUCCESS "${group.name}"`);
  return { name: group.name, slug: group.slug, success: true };
}

async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < tasks.length) {
      const i = nextIndex++;
      results[i] = await tasks[i]();
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

export async function POST(req: NextRequest) {
  log("=== Import request started ===");

  try {
    const formData = await req.formData();
    const explanation = (formData.get("explanation") as string) || "";
    const files = formData.getAll("files") as File[];

    log(`Received ${files.length} files, explanation: "${explanation.slice(0, 100)}"`);
    for (const f of files) {
      log(`  File: "${f.name}" (${(f.size / 1024).toFixed(1)}KB, type=${f.type})`);
    }

    if (files.length === 0) {
      log("ERROR: No files provided");
      return NextResponse.json({ error: "No files provided" }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      log("ERROR: ANTHROPIC_API_KEY not configured");
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY not configured" },
        { status: 500 }
      );
    }

    const client = new Anthropic({ apiKey });
    const { groups, unmatched } = groupFiles(files);
    const total = groups.length;

    log(`Processing ${total} groups with concurrency=${CONCURRENCY}...`);
    const startTime = Date.now();

    const tasks = groups.map((group, i) => {
      return async (): Promise<ImportResult> => {
        try {
          return await processGroup(client, group, i, total, explanation);
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : "Unknown error";
          const errorStack = err instanceof Error ? err.stack : "";
          log(`[${i + 1}/${total}] FAILED "${group.name}": ${errorMsg}`);
          if (errorStack) log(`[${i + 1}/${total}] Stack: ${errorStack}`);
          return { name: group.name, slug: group.slug, success: false, error: errorMsg };
        }
      };
    });

    const results = await runWithConcurrency(tasks, CONCURRENCY);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;
    log(`=== Import complete in ${elapsed}s: ${successCount} success, ${failCount} failed, ${unmatched.length} unmatched images ===`);

    return NextResponse.json({ results, unmatched });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Import failed";
    const errorStack = err instanceof Error ? err.stack : "";
    log(`FATAL ERROR: ${errorMsg}`);
    if (errorStack) log(`Stack: ${errorStack}`);
    return NextResponse.json(
      { error: errorMsg },
      { status: 500 }
    );
  }
}
