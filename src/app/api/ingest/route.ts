import { NextRequest, NextResponse } from "next/server";
import { createPage, savePageContent, saveImageToPage } from "@/lib/notes";
import { parseCSV, csvToMarkdownTable } from "@/lib/csv";
import pdfParse from "pdf-parse";

const ALLOWED_EXTENSIONS = new Set([".pdf", ".png", ".jpg", ".jpeg", ".csv"]);
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg"]);

function getExtension(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot >= 0 ? filename.slice(dot).toLowerCase() : "";
}

function getBaseName(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot >= 0 ? filename.slice(0, dot) : filename;
}

export async function POST(req: NextRequest) {
  // Auth check
  const apiKey = process.env.INGEST_API_KEY;
  if (apiKey) {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${apiKey}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const slug = formData.get("slug") as string | null;
    const title = (formData.get("title") as string | null) || null;

    if (!file) {
      return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }
    if (!slug) {
      return NextResponse.json({ error: "Missing slug" }, { status: 400 });
    }

    const ext = getExtension(file.name);
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return NextResponse.json(
        { error: `Unsupported file type: ${ext}. Allowed: PDF, PNG, JPG, CSV` },
        { status: 400 }
      );
    }

    const slugParts = slug.split("/").filter(Boolean);
    const pageTitle = title || getBaseName(file.name).replace(/-/g, " ");

    if (ext === ".csv") {
      const csvText = await file.text();
      const rows = parseCSV(csvText);
      const table = csvToMarkdownTable(rows);
      const markdown = `# ${pageTitle}\n\n${table}`;
      createPage(slugParts);
      savePageContent(slugParts, markdown);
    } else if (IMAGE_EXTENSIONS.has(ext)) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const filename = file.name;
      createPage(slugParts);
      const imageUrl = `/api/notes/images/${slugParts.join("/")}/${filename}`;
      const markdown = `# ${pageTitle}\n\n![${pageTitle}](${imageUrl})`;
      savePageContent(slugParts, markdown);
      saveImageToPage(slugParts, filename, buffer);
    } else if (ext === ".pdf") {
      const buffer = Buffer.from(await file.arrayBuffer());
      const data = await pdfParse(buffer);
      const markdown = `# ${pageTitle}\n\n${data.text}`;
      createPage(slugParts);
      savePageContent(slugParts, markdown);
    }

    return NextResponse.json({
      ok: true,
      slug: slugParts.join("/"),
      path: `/pages/${slugParts.join("/")}`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Ingest failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
