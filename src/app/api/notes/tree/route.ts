import { NextResponse } from "next/server";
import { getNotesTree } from "@/lib/notes";

export const dynamic = "force-dynamic";

export async function GET() {
  const tree = getNotesTree();
  return NextResponse.json(tree);
}
