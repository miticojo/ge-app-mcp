#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import { config } from './config.js';
import { searchTools, handleSearchToolCall } from './tools/search.js';
import { adminTools, handleAdminToolCall } from './tools/admin.js';
import { billingTools, handleBillingToolCall } from './tools/billing.js';
import { withAnnotations } from './annotations.js';
import { currentUserCredentials } from './gcp.js';
import { createGoogleTokenVerifier, startHttpServer } from './http.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageVersion: string = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../package.json'), 'utf-8')).version;

// Merge tool definitions dynamically based on allowed scopes
const allTools: any[] = [];
if (config.scopes.includes('search')) {
  allTools.push(...withAnnotations(searchTools));
}
if (config.scopes.includes('admin')) {
  // The Vertex AI Skill Registry only accepts the cloud-platform scope; hide it remotely when
  // tokens are restricted to discoveryengine.readwrite (see ADR-0003).
  const skillsUsable = config.transport === 'stdio' || config.http.acceptedScopes.includes('https://www.googleapis.com/auth/cloud-platform');
  allTools.push(...withAnnotations(adminTools.filter(t => skillsUsable || t.name !== 'gemini_enterprise_manage_skills')));
}
if (config.scopes.includes('billing')) {
  allTools.push(...withAnnotations(billingTools));
}

// Audit trail without arguments (they can contain policies or personal data) and without tokens.
function auditToolCall(name: string, args: any, outcome: 'ok' | 'error') {
  const action = typeof args?.action === 'string'
    ? args.action
    : (typeof args?.target === 'string' ? args.target : undefined);
  console.error(JSON.stringify({
    severity: outcome === 'ok' ? 'INFO' : 'WARNING',
    message: 'tool_call',
    tool: name,
    action,
    principal: currentUserCredentials()?.principal ?? (config.transport === 'stdio' ? 'local-adc' : undefined),
    outcome
  }));
}

async function routeToolCall(name: string, args: any) {
  // Security Check: Verify that the tool belongs to the allowed scopes
  const isToolAllowed = allTools.some(t => t.name === name);
  if (!isToolAllowed) {
    throw new Error(`Access Denied: Tool "${name}" is not enabled under the current MCP_SCOPES configuration.`);
  }

  // Route to search tools
  if (name.startsWith('gemini_enterprise_search') || name.startsWith('gemini_enterprise_ask') || name.startsWith('gemini_enterprise_get_document')) {
    return await handleSearchToolCall(name, args);
  }

  // Route to billing/licensing tools
  if (name === 'gemini_enterprise_manage_licenses' || name === 'gemini_enterprise_inspect_licenses') {
    return await handleBillingToolCall(name, args);
  }

  // Route to admin tools
  if (name.startsWith('gemini_enterprise_manage_') || name.startsWith('gemini_enterprise_configure_') || name === 'gemini_enterprise_get_operation' || name === 'gemini_enterprise_inspect') {
    return await handleAdminToolCall(name, args);
  }

  throw new Error(`Tool not found: ${name}`);
}

// One server per stdio process, or one per request in stateless HTTP mode.
function createServer(): Server {
  const server = new Server(
    {
      name: 'gemini-enterprise-server',
      version: packageVersion,
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: allTools,
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
      const result = await routeToolCall(name, args);
      auditToolCall(name, args, 'ok');
      return result;
    } catch (error: any) {
      auditToolCall(name, args, 'error');
      console.error(`Error executing tool ${name}:`, error?.message || error);
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: error.message || String(error),
          },
        ],
      };
    }
  });

  return server;
}

// CLI helper for skills management
function handleCliCommands(): boolean {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    return false; // Let the MCP server run
  }

  const subcommand = args[0];
  if (subcommand !== 'skills') {
    if (subcommand === '--help' || subcommand === '-h' || subcommand === 'help') {
      printHelp();
      process.exit(0);
    }
    return false; // Let the MCP server run
  }

  const action = args[1];
  const packageSkillsDir = path.resolve(__dirname, '../skills');

  if (action === 'list') {
    console.log('\n🌌 Available Gemini Enterprise Agent Skills:');
    console.log('============================================');
    try {
      const files = fs.readdirSync(packageSkillsDir);
      const dirs = files.filter(f => {
        const fullPath = path.join(packageSkillsDir, f);
        return fs.statSync(fullPath).isDirectory() && fs.existsSync(path.join(fullPath, 'SKILL.md'));
      });
      
      for (const dir of dirs) {
        const filePath = path.join(packageSkillsDir, dir, 'SKILL.md');
        const content = fs.readFileSync(filePath, 'utf-8');
        
        let title = dir;
        let desc = 'No description provided.';
        
        // Simple YAML frontmatter parser
        const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
        if (match) {
          const yaml = match[1];
          const lines = yaml.split('\n');
          for (const line of lines) {
            const parts = line.split(':');
            if (parts.length >= 2) {
              const key = parts[0].trim();
              const value = parts.slice(1).join(':').trim();
              if (key === 'name') title = value;
              else if (key === 'description') desc = value;
            }
          }
        } else {
          const lines = content.split('\n');
          const titleLine = lines.find(l => l.startsWith('# '));
          if (titleLine) title = titleLine.replace('# ', '').trim();
        }
        
        console.log(`\n• 🆔 ID: \x1b[36m${dir}\x1b[0m`);
        console.log(`  📝 Name: ${title}`);
        console.log(`  ℹ️  Description: ${desc}`);
      }
      console.log('\nTo install a skill, run:');
      console.log('  npx ge-app-mcp skills install <skill-id> [target-directory]\n');
    } catch (error: any) {
      console.error('Error listing available skills:', error.message);
    }
    process.exit(0);
  }

  if (action === 'install') {
    const skillId = args[2];
    let destDir = args[3] || './skills';

    if (!skillId) {
      console.error('Error: Please specify the skill ID to install (e.g. "admin-assistant").');
      console.error('Run "npx ge-app-mcp skills list" to view available skills.');
      process.exit(1);
    }

    const sourceDir = path.join(packageSkillsDir, skillId);
    if (!fs.existsSync(sourceDir) || !fs.statSync(sourceDir).isDirectory()) {
      console.error(`Error: Skill "${skillId}" not found in available templates.`);
      console.error('Run "npx ge-app-mcp skills list" to see valid IDs.');
      process.exit(1);
    }

    try {
      const absoluteDestSkillDir = path.resolve(destDir, skillId);
      if (!fs.existsSync(absoluteDestSkillDir)) {
        fs.mkdirSync(absoluteDestSkillDir, { recursive: true });
      }

      const sourceFile = path.join(sourceDir, 'SKILL.md');
      const destFile = path.join(absoluteDestSkillDir, 'SKILL.md');
      fs.copyFileSync(sourceFile, destFile);
      
      console.log(`\n✅ Success! Skill \x1b[32m"${skillId}"\x1b[0m has been installed to:`);
      console.log(`   ${destFile}\n`);
    } catch (error: any) {
      console.error('Error installing skill:', error.message);
      process.exit(1);
    }
    process.exit(0);
  }

  printHelp();
  process.exit(0);
}

function printHelp() {
  console.log('\n🌌 Gemini Enterprise MCP Server CLI');
  console.log('==================================');
  console.log('Usage:');
  console.log('  npx ge-app-mcp                     # Starts the MCP server on stdio (default)');
  console.log('  MCP_TRANSPORT=http npx ge-app-mcp  # Starts the Streamable HTTP server (end-user OAuth, see README)');
  console.log('  npx ge-app-mcp skills list         # Lists all available pre-built skills');
  console.log('  npx ge-app-mcp skills install <id> # Installs a pre-built skill to ./skills/\n');
}

// Start the server on the configured transport
async function run() {
  // If CLI subcommand was handled, process exits inside the helper
  if (handleCliCommands()) {
    return;
  }

  if (config.transport === 'http') {
    const verifier = createGoogleTokenVerifier({
      allowedClientIds: config.http.allowedOAuthClientIds,
      acceptedScopes: config.http.acceptedScopes,
      allowedEmailDomains: config.http.allowedEmailDomains
    });
    await startHttpServer({ createServer, verifier, port: config.http.port, allowedHosts: config.http.allowedHosts });
    console.error(`Gemini Enterprise MCP Server ${packageVersion} listening on :${config.http.port}/mcp (scopes: ${config.scopes.join(',')})`);
    return;
  }

  const transport = new StdioServerTransport();
  await createServer().connect(transport);
  console.error('Gemini Enterprise MCP Server running on stdio');
}

run().catch((error) => {
  console.error('Fatal error running server:', error);
  process.exit(1);
});
