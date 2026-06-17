# 🌌 Gemini Enterprise MCP Server & Agent Skills

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![Model Context Protocol](https://img.shields.io/badge/MCP-Compatible-green.svg)](https://modelcontextprotocol.io/)

Welcome to the official repository of the **Gemini Enterprise MCP Server**. This open-source project (released under the Apache 2.0 license) implements a **Model Context Protocol (MCP)** server in **TypeScript/ESM** to connect AI coding assistants and orchestration frameworks with the powerful **Google Cloud Discovery Engine** APIs (which power Gemini Enterprise App).

The server handles both **Data Plane** operations (semantic search, conversational RAG with the Answer API, document retrieval) and **Control Plane** operations (automated datastore creation, JSON schema management, ranking/Serving Configs tuning, and SaaS connector configurations).

---

## 🚀 Key Features & API Coverage

The server provides complete (100% operational coverage) mapping to the core gRPC/REST endpoints of Google Cloud Discovery Engine:

### 🔍 Data Plane (Semantic Search & RAG)
*   **Advanced Search (`gemini_enterprise_search`)**: Executes semantic queries on datastores, returning titles, snippets, URIs, and structured data formatted in clean Markdown for your agents.
*   **Conversational Search (`gemini_enterprise_ask`)**: Queries the Answer API (Conversational RAG) receiving grounding answers, confidence scores, and structured references.
*   **Document Retrieval (`gemini_enterprise_get_document`)**: Allows the agent to download the entire contents and structured metadata of an indexed document for in-depth analysis.

### ⚙️ Control Plane (Administration & Tuning)
*   **App & Engine Management (`gemini_enterprise_manage_apps`)**: Complete CRUD operations to create and configure search and chat applications with Long-Running Operations (LRO).
*   **DataStore Management (`gemini_enterprise_manage_datastore`)**: Instantiation and deletion of structured and unstructured Data Stores with custom industry verticals (e.g., `GENERIC`, `MEDIA`).
*   **Advanced Web Search (`gemini_enterprise_manage_target_sites`)**: Management of target sites (URLs and glob patterns) for automatic website crawling.
*   **Bulk Document Ingestion (`gemini_enterprise_manage_documents`)**: Asynchronous ingestion and purging of documents from Cloud Storage (`gs://...`) or BigQuery sources.
*   **Custom Schema Management (`gemini_enterprise_manage_schema`)**: Upload, modification, and retrieval of JSON schemas for indexing structured documents.
*   **Tuning & Controls (`gemini_enterprise_manage_controls`)**: Creation of boost/bury rules, synonyms, redirects, and filters on Serving Configs.
*   **SaaS Connectors (`gemini_enterprise_configure_connector`)**: High-fidelity simulated flow with synchronization state management for Jira, Salesforce, and Confluence.
*   **Agent Management (`gemini_enterprise_manage_agents`)**: End-to-end CRUD operations (create, list, delete, update) for native, server-side Gemini Enterprise Agents.
*   **License & Billing Management (`gemini_enterprise_manage_licenses`)**: Programmatic management of user seats on Gemini Enterprise / Gemini Code Assist license pools.

---

## 🛠️ Installation & Setup

### 1. Prerequisites
*   **Node.js**: v18.x or higher.
*   **Google Cloud SDK (`gcloud`)** installed and configured.
*   An active Google Cloud project with the **Discovery Engine API** enabled.

### 2. Local Authentication
Configure your local Application Default Credentials (ADC) pointing to your target GCP project:
```bash
gcloud auth application-default login
```

### 3. Environment Variables
Create a `.env` file in the root of the project (or set variables in your shell/IDE environment):
```env
GCP_PROJECT=your-gcp-project-id
GCP_LOCATION=global # optional, defaults to global (supports us, eu, etc.)
GCP_COLLECTION=default_collection # optional, defaults to default_collection

# OPTIONAL BUT RECOMMENDED:
# Set this variable if you encounter a local quota/billing project mismatch error from gcloud.
GOOGLE_CLOUD_QUOTA_PROJECT=your-gcp-project-id

# SECURITY SCOPES (Enforces Least Privilege):
# Comma-separated list of allowed scopes: search, admin, billing.
# Example: Use 'search' for standard coding assistants, and 'search,admin' for SRE agents.
# Defaults to 'search,admin,billing' if not specified.
MCP_SCOPES=search,admin,billing
```

> [!NOTE]
> **Quota & Billing Troubleshooting**:
> If during execution you receive an error like `7 PERMISSION_DENIED: Discovery Engine API has not been used in project...`, your local user credentials are trying to attribute billing quotas to a disabled local sandbox project. Setting `GOOGLE_CLOUD_QUOTA_PROJECT` forces the SDK to attribute quotas to the correct project.

### 4. Build the Project
Install dependencies and compile TypeScript files into JavaScript ESM:
```bash
npm install
npm run build
```

---

## 🧪 Testing Suite

To ensure stability and facilitate onboarding, the repository includes four ready-to-use testing scripts to validate connectivity, security, and the MCP interface:

1.  **`test_mcp_client.mjs` (MCP Protocol Handshake)**:
    Performs a standard handshake with the MCP server via stdio and prints the list of registered tools with their JSON schemas.
    ```bash
    node test_mcp_client.mjs
    ```
2.  **`test_suite_readonly.mjs` (GCP Read-Only Validation)**:
    Scans the available datastores in the configured GCP project, querying schemas, target sites, serving controls, and testing search queries.
    ```bash
    node test_suite_readonly.mjs
    ```
3.  **`test_admin_write.mjs` (GCP Control Plane Safe Write/Delete)**:
    Executes a complete read/write lifecycle on the Control Plane (creates a temporary synonym control, verifies its existence via list, and immediately deletes it). **100% safe with zero residue left on your Cloud project.**
    ```bash
    node test_admin_write.mjs
    ```
4.  **`test_agents_write.mjs` (Native Agent Lifecycle Safe Write/Delete)**:
    Executes a complete lifecycle check on native Discovery Engine Agents (creates a temporary agent, lists and updates it, then deletes it with zero residues remaining).
    ```bash
    node test_agents_write.mjs
    ```
5.  **`test_mcp_scopes.mjs` (Scope & Security Enforcement Suite)**:
    Validates that environment-based tool restrictions (`MCP_SCOPES`) work correctly. It tests `search` only, `search,billing`, and full scopes, verifying that unauthorized attempts to call out-of-scope tools are securely rejected with access denied responses.
    ```bash
    node test_mcp_scopes.mjs
    ```

---

## 🏃 Running & Installing the Server

The MCP server communicates via **stdio** transport. You can easily register it, compile it locally, or automate the entire setup.

### ⚡ Option A: Automatic Installation (Highly Recommended)
You can automatically add and register `ge-app-mcp` in your favorite AI coding assistant (Claude Desktop, Cursor, Claude Code, etc.) using the open-source [add-mcp](https://github.com/neondatabase/add-mcp) utility:

```bash
npx add-mcp ge-app-mcp --env "GCP_PROJECT=your-gcp-project-id" --env "MCP_SCOPES=search,admin,billing"
```
*(This automatically discovers your installed AI agents, configures their configuration files, and passes the required environment variables securely.)*

### Option B: Manual Execution via `npx`
To run the server directly from npm without cloning:
```bash
npx -y ge-app-mcp
```

### Option C: Compile and Run Locally
```bash
# Clone, install dependencies, compile and start:
npm install
npm run build
npm start

# In development with hot-reloading:
npm run dev
```

---

## 🧩 Managing Pre-Built Agent Skills

This project fully supports the open **Agent Skills** specification (compatible with Vercel's `skills` CLI and standard coding agents). You can manage them in two ways:

### ⚡ Option A: Automatic via Vercel's `skills` CLI (Recommended)
You can instantly install and load all our pre-built enterprise skills into your workspace using Vercel's [skills CLI](https://github.com/vercel-labs/skills):

```bash
npx skills add miticojo/ge-app-mcp
```

### Option B: Handled via the Local package CLI
If you prefer, you can use the built-in CLI utility bundled with our package to list and copy skills manually:

#### 1. List Available Pre-Built Skills
```bash
npx ge-app-mcp skills list
```

#### 2. Install a Pre-Built Skill
Copy a pre-built skill folder into your local project workspace (defaults to `./skills/` if target directory is omitted):
```bash
npx ge-app-mcp skills install <skill-id> [target-directory]

# Example:
npx ge-app-mcp skills install admin-assistant ./my-skills
```

---

## 🤖 AI Agents & IDE Integration (Cursor, Windsurf, Claude Desktop, etc.)

For detailed, copy-paste configurations to integrate this server into your preferred AI agent workflows, see our dedicated integration guide:

👉 **[AGENTS.md](file://./AGENTS.md)**

It provides comprehensive configurations for:
*   **Cursor / Windsurf / Claude Desktop** (Direct stdio setup using `npx ge-app-mcp`).
*   **Google Agent Development Kit (ADK)** (Native orchestration with `MCPToolset`).
*   **LangChain & LangGraph** (Python & TypeScript integrations).
*   **CrewAI**.

---

## 📂 Project Structure

```text
ge-app-mcp/
├── LICENSE                    # Apache 2.0 License
├── README.md                  # This file
├── AGENTS.md                  # Integration guide for AI Agents (ADK, LangChain, Cursor)
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts               # MCP Server entrypoint (tool routing)
│   ├── config.ts              # GCP environment variable configuration
│   └── tools/
│       ├── search.ts          # Search tool implementations (Data Plane)
│       ├── admin.ts           # Admin tool implementations (Control Plane)
│       └── billing.ts         # Billing & license management tools (Control Plane)
└── skills/                    # Agent Skills templates conforming to Vercel Agent Skills standard
    ├── admin-assistant/
    │   └── SKILL.md           # Skill for DevOps and infrastructure orchestration
    ├── enterprise-context/
    │   └── SKILL.md           # Skill for secure zero-trust enterprise search
    └── codebase-rag/
        └── SKILL.md           # Skill for debugging and conversational code context
```

---

## 📄 License

This project is licensed under the **Apache License, Version 2.0**. See the [LICENSE](file://./LICENSE) file for more information.
