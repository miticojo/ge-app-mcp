import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({
  command: 'node',
  args: ['/Users/giorgioc/Repos/ge-app-mcp/build/index.js'],
  env: {
    ...process.env,
    GCP_PROJECT: 'giorgioc-cloud-apps',
    GCP_LOCATION: 'global',
    GCP_COLLECTION: 'default_collection',
    GOOGLE_CLOUD_QUOTA_PROJECT: 'giorgioc-cloud-apps',
  }
});

const client = new Client({
  name: 'skills-lifecycle-test',
  version: '1.0.0'
}, {
  capabilities: {}
});

async function run() {
  console.log('🌌 Connecting to MCP Server...');
  await client.connect(transport);
  console.log('✅ Connected to MCP Server!\n');

  const projectId = 'giorgioc-cloud-apps';
  const location = 'us-central1';
  const testSkillId = `mcp-skill-${Math.floor(Math.random() * 10000)}`;

  console.log(`Targeting Project: "${projectId}"`);
  console.log(`Targeting Region: "${location}"`);
  console.log(`Generating Temporary Skill ID: "${testSkillId}"\n`);

  // STEP 1: Create a Platform Skill
  let created = false;
  let createdSkillName = null;
  try {
    console.log(`--- [1/3] Creating Platform Skill: "${testSkillId}" ---`);
    const response = await client.callTool({
      name: 'gemini_enterprise_manage_skills',
      arguments: {
        action: 'create',
        project_id: projectId,
        location: location,
        skill_id: testSkillId,
        display_name: `MCP Platform Test Skill ${testSkillId}`,
        description: 'A native platform skill created programmatically via MCP.',
        zipped_filesystem: 'UEsFBgAAAAAAAAAAAAAAAAAAAAAAAA==' // Valid minimal empty ZIP file base64 encoded
      }
    });

    console.log('Create Response:');
    console.log(response.content[0].text);
    
    const result = JSON.parse(response.content[0].text);
    if (result.status === 'SUCCESS' && result.operation && result.operation.name) {
      created = true;
      const opName = result.operation.name;
      const idx = opName.indexOf('/operations/');
      createdSkillName = idx !== -1 ? opName.substring(0, idx) : `projects/371308367860/locations/${location}/skills/${testSkillId}`;
    }
  } catch (err) {
    console.error('❌ Platform Skill creation failed:', err.message || err);
  }

  // STEP 2: List Platform Skills and Verify Presence
  if (created) {
    try {
      console.log('\n--- [2/3] Verifying Skill in registry list ---');
      const response = await client.callTool({
        name: 'gemini_enterprise_manage_skills',
        arguments: {
          action: 'list',
          project_id: projectId,
          location: location
        }
      });

      const result = JSON.parse(response.content[0].text);
      const skills = result.skills || [];
      const found = skills.find(s => s.name === createdSkillName || s.name.endsWith(`/${testSkillId}`));
      if (found) {
        console.log(`✅ Success! Skill "${testSkillId}" is present in list output.`);
        console.log('Registry details of the newly created skill:');
        console.log(JSON.stringify(found, null, 2));
      } else {
        console.warn(`⚠️ Warning: Skill "${testSkillId}" was not found in listing output!`);
      }
    } catch (err) {
      console.error('❌ Listing verification failed:', err.message || err);
    }

    // STEP 3: Clean up and delete
    try {
      console.log(`\n--- [3/3] Deleting Temporary Platform Skill: "${testSkillId}" ---`);
      const response = await client.callTool({
        name: 'gemini_enterprise_manage_skills',
        arguments: {
          action: 'delete',
          project_id: projectId,
          location: location,
          skill_id: testSkillId
        }
      });

      console.log('Delete Response:');
      console.log(response.content[0].text);
      console.log('✅ Temporary Platform Skill deleted successfully.');
    } catch (err) {
      console.error('❌ Deletion failed:', err.message || err);
    }
  }

  await client.close();
  process.exit(0);
}

run().catch((err) => {
  console.error('Fatal failure:', err);
  process.exit(1);
});
