import fs from "fs";
import path from "path";

export interface TreeNode {
  name: string;
  path: string;
  children: TreeNode[];
}

const NOTES_DIR = path.join(process.cwd(), "notes");

function ensureNotesDir() {
  if (!fs.existsSync(NOTES_DIR)) {
    fs.mkdirSync(NOTES_DIR, { recursive: true });
  }
}

export function getNotesTree(): TreeNode[] {
  ensureNotesDir();
  return scanDir(NOTES_DIR, "");
}

function scanDir(absPath: string, relativePath: string): TreeNode[] {
  const entries = fs.readdirSync(absPath, { withFileTypes: true });
  const nodes: TreeNode[] = [];

  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    if (!entry.isDirectory()) continue;

    const childRel = relativePath ? `${relativePath}/${entry.name}` : entry.name;
    const childAbs = path.join(absPath, entry.name);

    nodes.push({
      name: entry.name,
      path: childRel,
      children: scanDir(childAbs, childRel),
    });
  }

  return nodes.sort((a, b) => a.name.localeCompare(b.name));
}

export function getPageContent(slug: string[]): string {
  const filePath = path.join(NOTES_DIR, ...slug, "content.md");
  if (!fs.existsSync(filePath)) return "";
  return fs.readFileSync(filePath, "utf-8");
}

export function savePageContent(slug: string[], content: string) {
  const dirPath = path.join(NOTES_DIR, ...slug);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  fs.writeFileSync(path.join(dirPath, "content.md"), content, "utf-8");
}

export function createPage(slug: string[]) {
  const dirPath = path.join(NOTES_DIR, ...slug);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  const contentPath = path.join(dirPath, "content.md");
  if (!fs.existsSync(contentPath)) {
    fs.writeFileSync(contentPath, "", "utf-8");
  }
}

export function renamePage(oldSlug: string[], newName: string): string[] {
  const oldPath = path.join(NOTES_DIR, ...oldSlug);
  const parentSlug = oldSlug.slice(0, -1);
  const parentPath = parentSlug.length > 0 ? path.join(NOTES_DIR, ...parentSlug) : NOTES_DIR;
  const newPath = path.join(parentPath, newName);

  if (fs.existsSync(oldPath)) {
    fs.renameSync(oldPath, newPath);
  }

  return [...parentSlug, newName];
}

export function saveImageToPage(slug: string[], filename: string, buffer: Buffer) {
  const dirPath = path.join(NOTES_DIR, ...slug);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  fs.writeFileSync(path.join(dirPath, filename), buffer);
}

export function movePage(oldSlug: string[], newParentSlug: string[]): string[] {
  const pageName = oldSlug[oldSlug.length - 1];
  const oldPath = path.join(NOTES_DIR, ...oldSlug);
  const newParentPath = newParentSlug.length > 0 ? path.join(NOTES_DIR, ...newParentSlug) : NOTES_DIR;
  const newPath = path.join(newParentPath, pageName);

  // Validate source exists
  if (!fs.existsSync(oldPath)) {
    throw new Error("Source page does not exist");
  }

  // Validate not moving into own subtree
  const oldPrefix = oldSlug.join("/") + "/";
  const newParentStr = newParentSlug.join("/");
  if (newParentStr === oldSlug.join("/") || newParentStr.startsWith(oldPrefix)) {
    throw new Error("Cannot move a page into its own subtree");
  }

  // Validate no name conflict at destination
  if (fs.existsSync(newPath)) {
    throw new Error("A page with that name already exists at the destination");
  }

  // Ensure parent exists
  if (!fs.existsSync(newParentPath)) {
    fs.mkdirSync(newParentPath, { recursive: true });
  }

  fs.renameSync(oldPath, newPath);
  return [...newParentSlug, pageName];
}

export function getImagePath(slug: string[], filename: string): string {
  return path.join(NOTES_DIR, ...slug, filename);
}

export function deletePage(slug: string[]) {
  const dirPath = path.join(NOTES_DIR, ...slug);
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
}
