"use client";

import { useState, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface TreeNode {
  name: string;
  path: string;
  children: TreeNode[];
}

interface FlatPage {
  name: string;
  path: string;
}

function flattenTree(nodes: TreeNode[], depth: number = 0): FlatPage[] {
  const result: FlatPage[] = [];
  for (const node of nodes) {
    const indent = "\u00A0\u00A0".repeat(depth);
    result.push({ name: `${indent}${node.name.replace(/-/g, " ")}`, path: node.path });
    if (node.children.length > 0) {
      result.push(...flattenTree(node.children, depth + 1));
    }
  }
  return result;
}

export default function AnalysisPage() {
  const [context, setContext] = useState("");
  const [prompt, setPrompt] = useState("");
  const [pages, setPages] = useState<FlatPage[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [parentPage, setParentPage] = useState("");
  const [pageName, setPageName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  const fetchPages = useCallback(async () => {
    const res = await fetch("/api/notes/tree");
    const data: TreeNode[] = await res.json();
    setPages(flattenTree(data));
  }, []);

  useEffect(() => {
    fetchPages();
  }, [fetchPages]);

  const allSelected = pages.length > 0 && selected.size === pages.length;

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(pages.map((p) => p.path)));
    }
  };

  const togglePage = (path: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const handleAnalyze = async () => {
    if (selected.size === 0) return;
    setAnalyzing(true);
    setAnalysis(null);
    setError(null);

    try {
      const res = await fetch("/api/analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slugs: Array.from(selected),
          context,
          prompt,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Analysis failed");
      } else {
        setAnalysis(data.analysis);
        setSaved(null);
        setPageName("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSave = async () => {
    if (!analysis || !pageName.trim()) return;
    setSaving(true);
    const slug = parentPage
      ? `${parentPage}/${pageName.trim().replace(/\s+/g, "-")}`
      : pageName.trim().replace(/\s+/g, "-");
    try {
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, content: analysis }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to save page");
      } else {
        setSaved(slug);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save page");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-8 py-10">
      <h1 className="text-2xl font-bold mb-2">Analysis</h1>
      <p className="text-sm text-gray-500 mb-6">
        Select pages and provide context to get AI-generated analysis with
        proposals — identifying patterns, gaps, and opportunities across your
        notes.
      </p>

      {/* Project context */}
      <label className="block text-sm font-medium text-gray-700 mb-1">
        Project context (optional)
      </label>
      <div className="relative mb-6">
        <textarea
          value={context}
          onChange={(e) => {
            if (e.target.value.length <= 2000) setContext(e.target.value);
          }}
          placeholder="e.g. This project is about user onboarding flows for a SaaS product..."
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none h-24 focus:outline-none focus:ring-2 focus:ring-gray-300"
          maxLength={2000}
        />
        <span className="absolute bottom-2 right-3 text-xs text-gray-400">
          {context.length}/2000
        </span>
      </div>

      {/* Custom prompt */}
      <label className="block text-sm font-medium text-gray-700 mb-1">
        Prompt (optional)
      </label>
      <div className="relative mb-6">
        <textarea
          value={prompt}
          onChange={(e) => {
            if (e.target.value.length <= 4000) setPrompt(e.target.value);
          }}
          placeholder="e.g. Compare conversion rates across all pages and rank them from best to worst..."
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none h-24 focus:outline-none focus:ring-2 focus:ring-gray-300"
          maxLength={4000}
        />
        <span className="absolute bottom-2 right-3 text-xs text-gray-400">
          {prompt.length}/4000
        </span>
      </div>

      {/* Page selector */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-gray-700">
            Select pages ({selected.size} selected)
          </label>
          <button
            onClick={toggleAll}
            className="text-xs text-gray-500 hover:text-gray-700"
          >
            {allSelected ? "Deselect All" : "Select All"}
          </button>
        </div>
        <div className="border border-gray-200 rounded-lg max-h-64 overflow-y-auto">
          {pages.length === 0 ? (
            <p className="text-sm text-gray-400 p-3">No pages found</p>
          ) : (
            pages.map((page) => (
              <label
                key={page.path}
                className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer text-sm"
              >
                <input
                  type="checkbox"
                  checked={selected.has(page.path)}
                  onChange={() => togglePage(page.path)}
                  className="rounded border-gray-300 text-gray-900 focus:ring-gray-300"
                />
                <span className="text-gray-700 truncate">{page.name}</span>
              </label>
            ))
          )}
        </div>
      </div>

      {/* Analyze button */}
      <button
        onClick={handleAnalyze}
        disabled={selected.size === 0 || analyzing}
        className="px-5 py-2 bg-gray-900 text-white text-sm rounded hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {analyzing
          ? "Analyzing..."
          : `Analyze ${selected.size} page${selected.size !== 1 ? "s" : ""}`}
      </button>

      {/* Error */}
      {error && (
        <div className="mt-6 text-sm px-3 py-2 rounded bg-red-50 text-red-800 border border-red-200">
          {error}
        </div>
      )}

      {/* Results */}
      {analysis && (
        <div className="mt-8">
          <h2 className="text-sm font-medium text-gray-700 mb-3">Results</h2>
          <div className="prose prose-gray max-w-none border border-gray-200 rounded-lg p-6">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{analysis}</ReactMarkdown>
          </div>

          {/* Save as page */}
          <div className="mt-6 border border-gray-200 rounded-lg p-4">
            <h3 className="text-sm font-medium text-gray-700 mb-3">Save as Page</h3>
            {saved ? (
              <div className="text-sm px-3 py-2 rounded bg-green-50 text-green-800 border border-green-200">
                Saved to{" "}
                <a
                  href={`/pages/${saved}`}
                  className="underline hover:no-underline"
                >
                  /pages/{saved}
                </a>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    Parent page
                  </label>
                  <select
                    value={parentPage}
                    onChange={(e) => setParentPage(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300 bg-white"
                  >
                    <option value="">(root level)</option>
                    {pages.map((p) => (
                      <option key={p.path} value={p.path}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    Page name
                  </label>
                  <input
                    type="text"
                    value={pageName}
                    onChange={(e) => setPageName(e.target.value)}
                    placeholder="e.g. Analysis Results"
                    className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
                  />
                </div>
                <button
                  onClick={handleSave}
                  disabled={!pageName.trim() || saving}
                  className="px-4 py-1.5 bg-gray-900 text-white text-sm rounded hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? "Saving..." : "Save"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
