import { NextRequest, NextResponse } from "next/server";
import { getPageContent, savePageContent, createPage, renamePage, movePage, deletePage } from "@/lib/notes";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug");
  if (!slug) return NextResponse.json({ error: "Missing slug" }, { status: 400 });
  const parts = slug.split("/").filter(Boolean);
  const content = getPageContent(parts);
  return NextResponse.json({ content });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { slug, content } = body;
  if (!slug) return NextResponse.json({ error: "Missing slug" }, { status: 400 });
  const parts = (slug as string).split("/").filter(Boolean);

  if (content !== undefined) {
    savePageContent(parts, content);
  } else {
    createPage(parts);
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug");
  if (!slug) return NextResponse.json({ error: "Missing slug" }, { status: 400 });
  const parts = slug.split("/").filter(Boolean);
  deletePage(parts);
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { slug, newName, newParent } = body;
  if (!slug) {
    return NextResponse.json({ error: "Missing slug" }, { status: 400 });
  }
  const parts = (slug as string).split("/").filter(Boolean);

  // Move page to new parent
  if (newParent !== undefined) {
    try {
      const parentSlug = newParent === "" ? [] : (newParent as string).split("/").filter(Boolean);
      const newSlug = movePage(parts, parentSlug);
      return NextResponse.json({ newSlug: newSlug.join("/") });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Move failed";
      return NextResponse.json({ error: msg }, { status: 400 });
    }
  }

  // Rename page
  if (!newName) {
    return NextResponse.json({ error: "Missing newName or newParent" }, { status: 400 });
  }
  const newSlug = renamePage(parts, newName);
  return NextResponse.json({ newSlug: newSlug.join("/") });
}
