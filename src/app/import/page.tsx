"use client";

import { useState, useRef, useMemo } from "react";

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp"]);
const HTML_EXTENSIONS = new Set([".html", ".htm"]);
const ACCEPTED_EXTENSIONS = ".html,.htm,.png,.jpg,.jpeg,.gif,.webp";

function getExtension(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot >= 0 ? filename.slice(dot).toLowerCase() : "";
}

function getBaseName(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot >= 0 ? filename.slice(0, dot) : filename;
}

interface FileGroup {
  name: string;
  slug: string;
  htmlFile: File | null;
  imageFiles: File[];
}

function computeGroups(files: File[]): { groups: FileGroup[]; unmatched: File[] } {
  const htmlFiles: File[] = [];
  const imageFiles: File[] = [];

  for (const file of files) {
    const ext = getExtension(file.name);
    if (HTML_EXTENSIONS.has(ext)) htmlFiles.push(file);
    else if (IMAGE_EXTENSIONS.has(ext)) imageFiles.push(file);
  }

  const groups: FileGroup[] = [];
  const matchedImages = new Set<string>();

  for (const html of htmlFiles) {
    const baseName = getBaseName(html.name);
    const slug = baseName.replace(/\s+/g, "-");
    const matched: File[] = [];

    for (const img of imageFiles) {
      const imgBase = getBaseName(img.name);
      if (
        imgBase === baseName ||
        imgBase.startsWith(baseName + "-") ||
        imgBase.startsWith(baseName + "_")
      ) {
        matched.push(img);
        matchedImages.add(img.name);
      }
    }

    groups.push({ name: baseName, slug, htmlFile: html, imageFiles: matched });
  }

  const unmatched = imageFiles.filter((img) => !matchedImages.has(img.name));
  return { groups, unmatched };
}

interface ImportResult {
  name: string;
  slug: string;
  success: boolean;
  error?: string;
}

export default function ImportPage() {
  const [explanation, setExplanation] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<ImportResult[] | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { groups, unmatched } = useMemo(() => computeGroups(files), [files]);

  const addFiles = (newFiles: File[]) => {
    const valid = newFiles.filter((f) => {
      const ext = getExtension(f.name);
      return HTML_EXTENSIONS.has(ext) || IMAGE_EXTENSIONS.has(ext);
    });
    setFiles((prev) => {
      const existingNames = new Set(prev.map((f) => f.name));
      const deduped = valid.filter((f) => !existingNames.has(f.name));
      return [...prev, ...deduped];
    });
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    addFiles(Array.from(e.dataTransfer.files));
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    addFiles(Array.from(e.target.files));
    e.target.value = "";
  };

  const handleImport = async () => {
    if (groups.length === 0) return;
    setImporting(true);
    setResults(null);

    try {
      const formData = new FormData();
      formData.append("explanation", explanation);
      for (const file of files) {
        formData.append("files", file);
      }

      const res = await fetch("/api/import", { method: "POST", body: formData });
      const data = await res.json();

      if (!res.ok) {
        setResults([{ name: "Import", slug: "", success: false, error: data.error }]);
      } else {
        setResults(data.results);
      }
    } catch (err) {
      setResults([
        {
          name: "Import",
          slug: "",
          success: false,
          error: err instanceof Error ? err.message : "Network error",
        },
      ]);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-8 py-10">
      <h1 className="text-2xl font-bold mb-2">Import Files</h1>
      <p className="text-sm text-gray-500 mb-6">
        Import <strong>.html</strong> files with associated images. Claude AI will
        convert HTML to Markdown. Images are matched by filename prefix.
      </p>

      {/* Explanation */}
      <label className="block text-sm font-medium text-gray-700 mb-1">
        Instructions for Claude (optional)
      </label>
      <textarea
        value={explanation}
        onChange={(e) => setExplanation(e.target.value)}
        placeholder="e.g. Preserve heading structure, ignore navigation elements, keep all links..."
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-6 resize-none h-20 focus:outline-none focus:ring-2 focus:ring-gray-300"
      />

      {/* Dropzone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors ${
          isDragging
            ? "border-gray-800 bg-gray-50"
            : "border-gray-300 hover:border-gray-400"
        }`}
      >
        <svg
          className="w-10 h-10 mx-auto text-gray-400 mb-3"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
          />
        </svg>
        <p className="text-sm text-gray-500">
          Drop files here or{" "}
          <span className="text-gray-800 underline">browse</span>
        </p>
        <p className="text-xs text-gray-400 mt-1">
          HTML, PNG, JPG, GIF, WebP
        </p>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_EXTENSIONS}
          multiple
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div className="mt-6">
          <h2 className="text-sm font-medium text-gray-700 mb-2">
            Files ({files.length})
          </h2>
          <ul className="space-y-1">
            {files.map((file, i) => {
              const ext = getExtension(file.name);
              const isHtml = HTML_EXTENSIONS.has(ext);
              return (
                <li
                  key={`${file.name}-${i}`}
                  className="flex items-center justify-between text-sm py-1.5 px-3 bg-gray-50 rounded"
                >
                  <span className="flex items-center gap-2 truncate">
                    <span
                      className={`inline-block w-2 h-2 rounded-full ${
                        isHtml ? "bg-blue-400" : "bg-green-400"
                      }`}
                    />
                    <span className="text-gray-700 truncate">{file.name}</span>
                    <span className="text-gray-400 text-xs">
                      {(file.size / 1024).toFixed(1)}KB
                    </span>
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFile(i);
                    }}
                    className="text-gray-400 hover:text-gray-600 ml-2"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Grouping preview */}
      {groups.length > 0 && (
        <div className="mt-6">
          <h2 className="text-sm font-medium text-gray-700 mb-2">
            Pages to create ({groups.length})
          </h2>
          <div className="space-y-2">
            {groups.map((group) => (
              <div
                key={group.slug}
                className="border border-gray-200 rounded-lg p-3"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium text-sm text-gray-800">
                    {group.name}
                  </span>
                  <span className="text-xs text-gray-400">→ /pages/{group.slug}</span>
                </div>
                <div className="text-xs text-gray-500">
                  <span className="inline-flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-blue-400 inline-block" />
                    {group.htmlFile?.name}
                  </span>
                  {group.imageFiles.length > 0 && (
                    <span className="ml-3">
                      <span className="inline-flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-green-400 inline-block" />
                        {group.imageFiles.length} image
                        {group.imageFiles.length !== 1 ? "s" : ""}
                      </span>
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Unmatched images warning */}
      {unmatched.length > 0 && (
        <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-lg p-3">
          <p className="text-sm font-medium text-yellow-800 mb-1">
            Unmatched images ({unmatched.length})
          </p>
          <p className="text-xs text-yellow-700 mb-2">
            These images don&apos;t match any HTML file by prefix and will not be imported.
          </p>
          <ul className="text-xs text-yellow-700 space-y-0.5">
            {unmatched.map((img) => (
              <li key={img.name}>- {img.name}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Import button */}
      {groups.length > 0 && (
        <button
          onClick={handleImport}
          disabled={importing}
          className="mt-6 px-5 py-2 bg-gray-900 text-white text-sm rounded hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {importing ? "Importing..." : `Import ${groups.length} page${groups.length !== 1 ? "s" : ""}`}
        </button>
      )}

      {/* Results */}
      {results && (
        <div className="mt-6 space-y-2">
          <h2 className="text-sm font-medium text-gray-700 mb-2">Results</h2>
          {results.map((r, i) => (
            <div
              key={i}
              className={`text-sm px-3 py-2 rounded ${
                r.success
                  ? "bg-green-50 text-green-800 border border-green-200"
                  : "bg-red-50 text-red-800 border border-red-200"
              }`}
            >
              <span className="font-medium">{r.name}</span>
              {r.success ? (
                <span>
                  {" "}
                  — imported to{" "}
                  <a
                    href={`/pages/${r.slug}`}
                    className="underline hover:no-underline"
                  >
                    /pages/{r.slug}
                  </a>
                </span>
              ) : (
                <span> — {r.error}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
