#!/usr/bin/env node
/* eslint-env node */

import { loadConfig } from './config.js';
import { getDb } from './db/client.js';
import { createClient, listClients, deleteClient, updateClientName } from './services/clients.js';
import { createUpstream, listUpstreams, deleteUpstream, updateUpstreamName, findUpstreamByName } from './services/upstreams.js';
import { createMapping, listMappings, deleteMapping, updateMapping } from './services/model-mappings.js';
import {
  getChatGPTCodexStatus,
  loginChatGPTCodexBrowser,
  loginChatGPTCodexDeviceCode,
  logoutChatGPTCodex,
} from './services/chatgpt-codex-auth.js';

const args = process.argv.slice(2);

function usage() {
  console.log(`Usage: manticore <command> [options]

Commands:
  clients create <name>                     Create a new client
  clients list                              List all clients
  clients delete <id>                       Soft-delete a client
  clients edit <id> <newName>               Rename a client

  upstreams create <name> <baseUrl> [--api-key <key>] [--header k=v ...]
                                            Register an upstream
  upstreams create <name> --type chatgpt-codex
                                            Register a ChatGPT Codex upstream
  upstreams list                            List all upstreams
  upstreams delete <id>                     Delete an upstream
  upstreams edit <id> <newName>             Rename an upstream

  model-mappings create <abstract> <upstream> <modelPath> [--priority N]
                                            Create a model mapping
  model-mappings list                       List all model mappings
  model-mappings delete <id>                Delete a model mapping
  model-mappings edit <id> [--abstract-name <name>] [--upstream <upstream>]
                                            [--model-path <path>] [--priority <n>]
                                            Update a model mapping

  migrate                                   Run database migrations

  codex login [--device-code]               Authenticate ChatGPT Codex
  codex status                              Show ChatGPT Codex auth status
  codex logout                              Delete stored ChatGPT Codex credentials

Options:
  --help                                    Show this help message
`);
}

async function run() {
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    usage();
    process.exit(0);
  }

  const command = args[0];

  if (command === 'migrate') {
    // Side-effect import runs migrations
    try {
      loadConfig();
      getDb();
      await import('./db/migrate.js');
    } catch (err: unknown) {
      console.error('Migration failed:', err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
    return;
  }

  if (command === 'clients') {
    const sub = args[1];
    if (sub === 'create') {
      const name = args[2];
      if (!name) {
        console.error('Error: client name is required');
        process.exit(1);
      }
      loadConfig();
      getDb();
      const result = await createClient(name);
      console.log('Created client:');
      console.log(`  id        : ${result.client.id}`);
      console.log(`  name      : ${result.client.name}`);
      console.log(`  apiKey    : ${result.apiKey}`);
      console.log(`  createdAt : ${result.client.createdAt}`);
      return;
    }

    if (sub === 'list') {
      loadConfig();
      getDb();
      const rows = await listClients();
      if (rows.length === 0) {
        console.log('No clients found.');
        return;
      }
      console.table(
        rows.map((r) => ({
          id: r.id,
          name: r.name,
          apiKey: r.apiKeyMasked,
          createdAt: r.createdAt,
          deletedAt: r.deletedAt ?? '-',
        }))
      );
      return;
    }

    if (sub === 'delete') {
      const id = args[2];
      if (!id) {
        console.error('Error: client id is required');
        process.exit(1);
      }
      loadConfig();
      getDb();
      await deleteClient(id);
      console.log('Client deleted.');
      return;
    }

    if (sub === 'edit') {
      const id = args[2];
      const newName = args[3];
      if (!id || !newName) {
        console.error('Error: client id and new name are required');
        process.exit(1);
      }
      loadConfig();
      getDb();
      const updated = await updateClientName(id, newName);
      console.log('Client renamed:');
      console.log(`  id    : ${updated.id}`);
      console.log(`  name  : ${updated.name}`);
      return;
    }

    console.error(`Unknown clients subcommand: ${sub ?? '(none)'}`);
    process.exit(1);
  }

  if (command === 'upstreams') {
    const sub = args[1];
    if (sub === 'create') {
      const name = args[2];
      let baseUrl = args[3];
      if (!name) {
        console.error('Error: name is required');
        process.exit(1);
      }

      let apiKey: string | undefined;
      const headers: Record<string, string> = {};
      let type: 'openai-compatible' | 'chatgpt-codex' = 'openai-compatible';

      for (let i = 3; i < args.length; i++) {
        if (args[i] === '--api-key' && i + 1 < args.length) {
          apiKey = args[++i];
        } else if (args[i] === '--header' && i + 1 < args.length) {
          const [k, ...vs] = args[++i].split('=');
          if (k && vs.length > 0) {
            headers[k] = vs.join('=');
          }
        } else if (args[i] === '--type' && i + 1 < args.length) {
          const rawType = args[++i];
          if (rawType !== 'openai-compatible' && rawType !== 'chatgpt-codex') {
            console.error('Error: type must be openai-compatible or chatgpt-codex');
            process.exit(1);
          }
          type = rawType;
        } else if (!args[i].startsWith('--')) {
          baseUrl = args[i];
        }
      }

      if (type === 'openai-compatible' && !baseUrl) {
        console.error('Error: baseUrl is required for openai-compatible upstreams');
        process.exit(1);
      }

      loadConfig();
      getDb();
      const upstream = createUpstream({
        name,
        type,
        baseUrl,
        apiKey: apiKey ?? null,
        headers: Object.keys(headers).length > 0 ? headers : null,
      });
      console.log('Created upstream:');
      console.log(`  id    : ${upstream.id}`);
      console.log(`  name  : ${upstream.name}`);
      console.log(`  type  : ${upstream.type}`);
      console.log(`  baseUrl: ${upstream.baseUrl ?? '-'}`);
      console.log(`  apiKey: ${upstream.apiKeyMasked ?? '-'}`);
      console.log(`  headers: ${upstream.headers ? JSON.stringify(upstream.headers) : '-'}`);
      return;
    }

    if (sub === 'list') {
      loadConfig();
      getDb();
      const rows = listUpstreams();
      if (rows.length === 0) {
        console.log('No upstreams found.');
        return;
      }
      console.table(
        rows.map((r) => ({
          id: r.id,
          name: r.name,
          type: r.type,
          baseUrl: r.baseUrl ?? '-',
          apiKey: r.apiKeyMasked ?? '-',
        }))
      );
      return;
    }

    if (sub === 'delete') {
      const id = args[2];
      if (!id) {
        console.error('Error: upstream id is required');
        process.exit(1);
      }
      loadConfig();
      getDb();
      deleteUpstream(id);
      console.log('Upstream deleted.');
      return;
    }

    if (sub === 'edit') {
      const id = args[2];
      const newName = args[3];
      if (!id || !newName) {
        console.error('Error: upstream id and new name are required');
        process.exit(1);
      }
      loadConfig();
      getDb();
      const updated = updateUpstreamName(id, newName);
      console.log('Upstream renamed:');
      console.log(`  id    : ${updated.id}`);
      console.log(`  name  : ${updated.name}`);
      return;
    }

    console.error(`Unknown upstreams subcommand: ${sub ?? '(none)'}`);
    process.exit(1);
  }

  if (command === 'codex') {
    const sub = args[1];
    if (sub === 'status') {
      loadConfig();
      getDb();
      const status = getChatGPTCodexStatus();
      console.log(status.authenticated ? 'ChatGPT Codex authenticated.' : 'ChatGPT Codex not authenticated.');
      if (status.accountId) console.log(`  accountId: ${status.accountId}`);
      if (status.expiresAt) console.log(`  expiresAt: ${status.expiresAt}`);
      return;
    }

    if (sub === 'logout') {
      loadConfig();
      getDb();
      logoutChatGPTCodex();
      console.log('ChatGPT Codex credentials deleted.');
      return;
    }

    if (sub === 'login') {
      loadConfig();
      getDb();
      const useDeviceCode = args.includes('--device-code');
      if (useDeviceCode) {
        const credentials = await loginChatGPTCodexDeviceCode((info) => {
          console.log('Open this URL and enter the code:');
          console.log(`  ${info.verificationUri}`);
          console.log(`  code: ${info.userCode}`);
        });
        console.log('ChatGPT Codex authenticated.');
        console.log(`  accountId: ${credentials.accountId}`);
        console.log(`  expiresAt: ${credentials.expiresAt.toISOString()}`);
        return;
      }

      const credentials = await loginChatGPTCodexBrowser((url) => {
        console.log('Open this URL in your browser to authenticate ChatGPT Codex:');
        console.log(url);
        console.log('Waiting for localhost callback on http://localhost:1455/auth/callback ...');
      });
      console.log('ChatGPT Codex authenticated.');
      console.log(`  accountId: ${credentials.accountId}`);
      console.log(`  expiresAt: ${credentials.expiresAt.toISOString()}`);
      return;
    }

    console.error(`Unknown codex subcommand: ${sub ?? '(none)'}`);
    process.exit(1);
  }

  if (command === 'model-mappings') {
    const sub = args[1];
    if (sub === 'create') {
      const abstractName = args[2];
      const upstreamName = args[3];
      const modelPath = args[4];
      if (!abstractName || !upstreamName || !modelPath) {
        console.error('Error: abstract name, upstream name, and model path are required');
        process.exit(1);
      }

      let priority: number | undefined;
      for (let i = 5; i < args.length; i++) {
        if (args[i] === '--priority' && i + 1 < args.length) {
          const n = Number(args[++i]);
          if (Number.isNaN(n) || !Number.isInteger(n) || n < 1) {
            console.error('Error: priority must be a positive integer');
            process.exit(1);
          }
          priority = n;
        }
      }

      loadConfig();
      getDb();
      const upstream = findUpstreamByName(upstreamName);
      if (!upstream) {
        console.error(`Error: upstream '${upstreamName}' not found`);
        process.exit(1);
      }
      const mapping = createMapping({
        abstractName,
        upstreamId: upstream.id,
        modelPath,
        priority,
      });
      console.log('Created model mapping:');
      console.log(`  id           : ${mapping.id}`);
      console.log(`  abstractName : ${mapping.abstractName}`);
      console.log(`  upstreamId   : ${mapping.upstreamId}`);
      console.log(`  upstreamName : ${mapping.upstreamName}`);
      console.log(`  modelPath    : ${mapping.modelPath}`);
      console.log(`  priority     : ${mapping.priority}`);
      return;
    }

    if (sub === 'list') {
      loadConfig();
      getDb();
      const rows = listMappings();
      if (rows.length === 0) {
        console.log('No model mappings found.');
        return;
      }
      console.table(
        rows.map((r) => ({
          id: r.id,
          abstractName: r.abstractName,
          upstreamId: r.upstreamId,
          upstreamName: r.upstreamName,
          modelPath: r.modelPath,
          priority: r.priority,
        }))
      );
      return;
    }

    if (sub === 'delete') {
      const id = args[2];
      if (!id) {
        console.error('Error: model mapping id is required');
        process.exit(1);
      }
      loadConfig();
      getDb();
      deleteMapping(id);
      console.log('Model mapping deleted.');
      return;
    }

    if (sub === 'edit') {
      const id = args[2];
      if (!id) {
        console.error('Error: model mapping id is required');
        process.exit(1);
      }

      let abstractName: string | undefined;
      let upstreamName: string | undefined;
      let modelPath: string | undefined;
      let priority: number | undefined;

      for (let i = 3; i < args.length; i++) {
        if (args[i] === '--abstract-name' && i + 1 < args.length) {
          abstractName = args[++i];
        } else if (args[i] === '--upstream' && i + 1 < args.length) {
          upstreamName = args[++i];
        } else if (args[i] === '--model-path' && i + 1 < args.length) {
          modelPath = args[++i];
        } else if (args[i] === '--priority' && i + 1 < args.length) {
          const n = Number(args[++i]);
          if (Number.isNaN(n) || !Number.isInteger(n) || n < 1) {
            console.error('Error: priority must be a positive integer');
            process.exit(1);
          }
          priority = n;
        }
      }

      loadConfig();
      getDb();

      let upstreamId: string | undefined;
      if (upstreamName) {
        const upstream = findUpstreamByName(upstreamName);
        if (!upstream) {
          console.error(`Error: upstream '${upstreamName}' not found`);
          process.exit(1);
        }
        upstreamId = upstream.id;
      }

      const mapping = updateMapping(id, {
        abstractName,
        upstreamId,
        modelPath,
        priority,
      });
      console.log('Model mapping updated:');
      console.log(`  id           : ${mapping.id}`);
      console.log(`  abstractName : ${mapping.abstractName}`);
      console.log(`  upstreamName : ${mapping.upstreamName}`);
      console.log(`  modelPath    : ${mapping.modelPath}`);
      console.log(`  priority     : ${mapping.priority}`);
      return;
    }

    console.error(`Unknown model-mappings subcommand: ${sub ?? '(none)'}`);
    process.exit(1);
  }

  console.error(`Unknown command: ${command}`);
  process.exit(1);
}

run().catch((err: unknown) => {
  console.error('CLI error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
