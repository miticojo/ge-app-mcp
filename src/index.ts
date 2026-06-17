#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  CallToolRequest,
  ListToolsRequest
} from '@modelcontextprotocol/sdk/types.js';
import { config } from './config.js';
import { searchTools, handleSearchToolCall } from './tools/search.js';
import { adminTools, handleAdminToolCall } from './tools/admin.js';
import { billingTools, handleBillingToolCall } from './tools/billing.js';

// Initialize the MCP server
const server = new Server(
  {
    name: 'gemini-enterprise-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Merge tool definitions dynamically based on allowed scopes
const allTools: any[] = [];
if (config.scopes.includes('search')) {
  allTools.push(...searchTools);
}
if (config.scopes.includes('admin')) {
  allTools.push(...adminTools);
}
if (config.scopes.includes('billing')) {
  allTools.push(...billingTools);
}

// Register list tools handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: allTools,
  };
});

// Register call tool handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
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
    if (name.startsWith('gemini_enterprise_manage_licenses')) {
      return await handleBillingToolCall(name, args);
    }
    
    // Route to admin tools
    if (name.startsWith('gemini_enterprise_manage_') || name.startsWith('gemini_enterprise_configure_')) {
      return await handleAdminToolCall(name, args);
    }

    throw new Error(`Tool not found: ${name}`);
  } catch (error: any) {
    console.error(`Error executing tool ${name}:`, error);
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
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
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
  console.log('  npx ge-app-mcp skills list         # Lists all available pre-built skills');
  console.log('  npx ge-app-mcp skills install <id> # Installs a pre-built skill to ./skills/\n');
}

// Start the server using stdio transport
async function run() {
  // If CLI subcommand was handled, process exits inside the helper
  if (handleCliCommands()) {
    return;
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Gemini Enterprise MCP Server running on stdio');
}

run().catch((error) => {
  console.error('Fatal error running server:', error);
  process.exit(1);
});
