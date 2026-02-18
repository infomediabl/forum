import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const NOTES_DIR = path.join(process.cwd(), "notes");

const MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const segments = (await params).path;

  // Validate against path traversal
  if (segments.some((s) => s === ".." || s.includes("\\"))) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  const filePath = path.join(NOTES_DIR, ...segments);

  // Ensure resolved path stays within NOTES_DIR
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(NOTES_DIR))) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  const ext = path.extname(filePath).toLowerCase();
  const mimeType = MIME_TYPES[ext];
  if (!mimeType) {
    return NextResponse.json({ error: "Unsupported file type" }, { status: 400 });
  }

  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const buffer = fs.readFileSync(filePath);
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": mimeType,
      "Cache-Control": "public, max-age=3600",
    },
  });
}
