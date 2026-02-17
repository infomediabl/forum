"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";

interface TreeNode {
  name: string;
  path: string;
  children: TreeNode[];
}

function TreeItem({
  node,
  depth,
  activePath,
  onNavigate,
  onNewSubpage,
  onPrefetch,
  refreshTree,
}: {
  node: TreeNode;
  depth: number;
  activePath: string;
  onNavigate: (path: string) => void;
  onNewSubpage: (parentPath: string) => void;
  onPrefetch: (path: string) => void;
  refreshTree: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const isActive = activePath === node.path;
  const hasChildren = node.children.length > 0;

  return (
    <div>
      <div
        className={`group flex items-center gap-1 py-1 pr-2 rounded cursor-pointer text-sm hover:bg-gray-100 ${
          isActive ? "bg-gray-100 font-medium" : "text-gray-700"
        }`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(!expanded);
          }}
          className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-gray-600 shrink-0"
        >
          {hasChildren ? (
            <svg
              className={`w-3 h-3 transition-transform ${expanded ? "rotate-90" : ""}`}
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                clipRule="evenodd"
              />
            </svg>
          ) : (
            <span className="w-3 h-3 flex items-center justify-center text-gray-300">
              <svg className="w-2 h-2" fill="currentColor" viewBox="0 0 8 8">
                <circle cx="4" cy="4" r="2" />
              </svg>
            </span>
          )}
        </button>

        <span
          className="flex-1 truncate"
          onClick={() => onNavigate(node.path)}
          onMouseEnter={() => onPrefetch(node.path)}
        >
          {node.name.replace(/-/g, " ")}
        </span>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onNewSubpage(node.path);
          }}
          className="opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center text-gray-400 hover:text-gray-600 shrink-0"
          title="New subpage"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>

      {expanded && hasChildren && (
        <div>
          {node.children.map((child) => (
            <TreeItem
              key={child.path}
              node={child}
              depth={depth + 1}
              activePath={activePath}
              onNavigate={onNavigate}
              onNewSubpage={onNewSubpage}
              onPrefetch={onPrefetch}
              refreshTree={refreshTree}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function Sidebar() {
  const [tree, setTree] = useState<TreeNode[]>([]);
  const router = useRouter();
  const pathname = usePathname();

  const activePath = pathname.startsWith("/pages/")
    ? decodeURIComponent(pathname.replace("/pages/", ""))
    : "";

  const fetchTree = useCallback(async () => {
    const res = await fetch("/api/notes/tree");
    const data = await res.json();
    setTree(data);
  }, []);

  useEffect(() => {
    fetchTree();
  }, [fetchTree]);

  const handleNavigate = (pagePath: string) => {
    router.push(`/pages/${pagePath}`);
  };

  const prefetched = useRef(new Set<string>());
  const handlePrefetch = useCallback((pagePath: string) => {
    if (prefetched.current.has(pagePath)) return;
    prefetched.current.add(pagePath);
    // Prefetch the route (triggers Next.js compilation)
    router.prefetch(`/pages/${pagePath}`);
    // Prefetch the page content and cache it in sessionStorage
    fetch(`/api/notes?slug=${encodeURIComponent(pagePath)}`)
      .then((res) => res.json())
      .then((data) => {
        try {
          sessionStorage.setItem(`page-cache:${pagePath}`, data.content ?? "");
        } catch {
          // storage full
        }
      })
      .catch(() => {});
  }, [router]);

  const handleNewPage = async () => {
    const name = prompt("Page name:");
    if (!name) return;
    const slug = name.replace(/\s+/g, "-");
    await fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug }),
    });
    await fetchTree();
    router.push(`/pages/${slug}`);
  };

  const handleNewSubpage = async (parentPath: string) => {
    const name = prompt("Subpage name:");
    if (!name) return;
    const slug = `${parentPath}/${name.replace(/\s+/g, "-")}`;
    await fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug }),
    });
    await fetchTree();
    router.push(`/pages/${slug}`);
  };

  return (
    <aside className="w-64 h-screen bg-white border-r border-gray-200 flex flex-col shrink-0">
      <div className="p-4 border-b border-gray-100">
        <h1 className="text-sm font-semibold text-gray-800 tracking-wide">Notes</h1>
      </div>

      <nav className="flex-1 overflow-y-auto py-2 px-1">
        {tree.map((node) => (
          <TreeItem
            key={node.path}
            node={node}
            depth={0}
            activePath={activePath}
            onNavigate={handleNavigate}
            onNewSubpage={handleNewSubpage}
            onPrefetch={handlePrefetch}
            refreshTree={fetchTree}
          />
        ))}
      </nav>

      <div className="p-2 border-t border-gray-100 space-y-1">
        <button
          onClick={handleNewPage}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Page
        </button>
        <button
          onClick={() => router.push("/import")}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
            />
          </svg>
          Import
        </button>
        <button
          onClick={() => router.push("/analysis")}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
            />
          </svg>
          Analysis
        </button>
      </div>
    </aside>
  );
}
