"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type SaveStatus = "idle" | "saving" | "saved" | "error";

const CACHE_PREFIX = "page-cache:";

function getCached(slug: string): string | null {
  try {
    return sessionStorage.getItem(CACHE_PREFIX + slug);
  } catch {
    return null;
  }
}

function setCache(slug: string, content: string) {
  try {
    sessionStorage.setItem(CACHE_PREFIX + slug, content);
  } catch {
    // storage full — ignore
  }
}

export default function NotePage() {
  const params = useParams();
  const router = useRouter();
  const slug = (params.slug as string[]).map(decodeURIComponent);
  const slugStr = slug.join("/");

  const cached = getCached(slugStr);
  const [content, setContent] = useState(cached ?? "");
  const [title, setTitle] = useState(slug[slug.length - 1].replace(/-/g, " "));
  const [loaded, setLoaded] = useState(cached !== null);
  const [editing, setEditing] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchContent = useCallback(async () => {
    const res = await fetch(`/api/notes?slug=${encodeURIComponent(slugStr)}`);
    const data = await res.json();
    const freshContent = data.content ?? "";
    setContent(freshContent);
    setCache(slugStr, freshContent);
    setLoaded(true);
  }, [slugStr]);

  useEffect(() => {
    setTitle(slug[slug.length - 1].replace(/-/g, " "));
    setEditing(false);
    setSaveStatus("idle");

    const cachedContent = getCached(slugStr);
    if (cachedContent !== null) {
      setContent(cachedContent);
      setLoaded(true);
      // Still fetch fresh content in background
      fetchContent();
    } else {
      setLoaded(false);
      fetchContent();
    }
  }, [slugStr, fetchContent, slug]);

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (savedTimer.current) clearTimeout(savedTimer.current);
    };
  }, [slugStr]);

  const autoSave = (newContent: string) => {
    setContent(newContent);
    setCache(slugStr, newContent);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (savedTimer.current) clearTimeout(savedTimer.current);
    setSaveStatus("saving");
    saveTimer.current = setTimeout(async () => {
      try {
        const res = await fetch("/api/notes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug: slugStr, content: newContent }),
        });
        if (!res.ok) throw new Error("Save failed");
        setSaveStatus("saved");
        savedTimer.current = setTimeout(() => setSaveStatus("idle"), 2000);
      } catch {
        setSaveStatus("error");
      }
    }, 500);
  };

  const handleRename = async () => {
    const newName = title.trim().replace(/\s+/g, "-");
    const currentName = slug[slug.length - 1];
    if (!newName || newName === currentName) {
      setTitle(currentName.replace(/-/g, " "));
      return;
    }
    const res = await fetch("/api/notes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: slugStr, newName }),
    });
    const data = await res.json();
    if (data.newSlug) {
      router.push(`/pages/${data.newSlug}`);
    }
  };

  const breadcrumbs = slug.map((part, i) => ({
    label: part.replace(/-/g, " "),
    path: slug.slice(0, i + 1).join("/"),
  }));

  if (!loaded) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        Loading...
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-8 py-10">
      {/* Breadcrumb + Controls */}
      <div className="flex items-center justify-between mb-6">
        <nav className="flex items-center gap-1 text-sm text-gray-400">
          {breadcrumbs.map((crumb, i) => (
            <span key={crumb.path} className="flex items-center gap-1">
              {i > 0 && <span className="mx-1">/</span>}
              <button
                onClick={() => router.push(`/pages/${crumb.path}`)}
                className={`hover:text-gray-600 ${
                  i === breadcrumbs.length - 1 ? "text-gray-600" : ""
                }`}
              >
                {crumb.label}
              </button>
            </span>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          {saveStatus !== "idle" && (
            <span
              className={`text-xs ${
                saveStatus === "saving"
                  ? "text-gray-400"
                  : saveStatus === "saved"
                  ? "text-green-500"
                  : "text-red-500"
              }`}
            >
              {saveStatus === "saving"
                ? "Saving..."
                : saveStatus === "saved"
                ? "Saved"
                : "Error saving"}
            </span>
          )}
          <button
            onClick={() => setEditing(!editing)}
            className={`text-xs px-2.5 py-1 rounded border transition-colors ${
              editing
                ? "bg-gray-900 text-white border-gray-900"
                : "bg-white text-gray-500 border-gray-300 hover:border-gray-400"
            }`}
          >
            {editing ? "Preview" : "Edit"}
          </button>
          <button
            onClick={async () => {
              if (!confirm("Delete this page and all its subpages?")) return;
              await fetch(`/api/notes?slug=${encodeURIComponent(slugStr)}`, {
                method: "DELETE",
              });
              const parent = slug.slice(0, -1).join("/");
              router.push(parent ? `/pages/${parent}` : "/");
            }}
            className="text-xs px-2.5 py-1 rounded border border-gray-300 text-red-500 hover:bg-red-50 hover:border-red-300 transition-colors"
            title="Delete page"
          >
            Delete
          </button>
        </div>
      </div>

      {/* Title */}
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={handleRename}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleRename();
        }}
        className="w-full text-4xl font-bold border-none outline-none bg-transparent placeholder-gray-300 mb-6"
        placeholder="Untitled"
      />

      {/* Content */}
      {editing ? (
        <textarea
          value={content}
          onChange={(e) => autoSave(e.target.value)}
          className="w-full min-h-[60vh] text-base leading-relaxed border-none outline-none bg-transparent resize-none placeholder-gray-300 font-mono text-sm"
          placeholder="Start writing..."
        />
      ) : (
        <div
          className="prose prose-gray max-w-none"
          onClick={() => {
            if (!content.trim()) setEditing(true);
          }}
        >
          {content.trim() ? (
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
          ) : (
            <p
              className="text-gray-300 cursor-text"
              onClick={() => setEditing(true)}
            >
              Start writing...
            </p>
          )}
        </div>
      )}
    </div>
  );
}
