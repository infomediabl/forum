Project Overview: Local File-Based Notes
Storage Strategy: Each "Page" is a folder. The content lives in a content.md file inside that folder. Subpages are simply sub-folders.

Structure Example: /notes/My-Project/content.md and /notes/My-Project/Sub-Page/content.md.

Claude Code Execution Steps
Step 1: Local Environment & File System Setup
Prompt to Claude: Initialize a Next.js project with Tailwind CSS. Create a base directory in the project root called /notes. Set up a utility using Node’s fs (FileSystem) module to recursively read the /notes directory. Ensure the UI is minimalist "Notion-white."

Step 2: Recursive Folder-to-Tree Logic
Prompt to Claude: Create a function that scans the /notes folder and returns a JSON tree representing the folder structure.

Folders = Pages.

Nested Folders = Subpages.

Ignore hidden files.

Build a Sidebar component that displays this tree with nested indentation and chevron icons for expanding/collapsing.

Step 3: File-Based Navigation & Creation
Prompt to Claude: Implement a dynamic route /pages/[...slug].

The slug should map directly to the folder path in /notes.

Add a "New Page" button in the Sidebar that creates a new folder and an empty content.md inside it.

Add a "New Subpage" button next to existing folders that creates a nested sub-folder.

Step 4: The Markdown Editor (Local-First)
Prompt to Claude: Build the editor view for the content.md files.

Use a borderless input for the folder name (Page Title). Renaming the title should rename the folder on the disk.

Use a textarea for the Markdown content.

Implement auto-save: as I type, Claude should overwrite the content.md file in the corresponding folder.

Add a breadcrumb at the top based on the folder path (e.g., Root > Work > Project A).

Step 5: The "Import" Page (File-to-Folder)
Prompt to Claude: Create a route at /import.

Add a link in the Sidebar for "Import".

Design a "Dropzone" UI.

Add a placeholder comment in the code where I will later provide logic to move external .md or .txt files into our /notes directory structure.