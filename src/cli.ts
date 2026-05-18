#!/usr/bin/env node
/* eslint-env node */

import { loadConfig } from './config.js';
import { getDb } from './db/client.js';
import { createClient, listClients, deleteClient } from './services/clients.js';
import { createUpstream, listUpstreams, deleteUpstream } from './services/upstreams.js';

const args = process.argv.slice(2);

function usage() {
  console.log(`Usage: manticore <command> [options]

Commands:
  clients create <name>                     Create a new client
  clients list                              List all clients
  clients delete <id>                       Soft-delete a client

  upstreams create <name> <baseUrl> [--api-key <key>] [--header k=v ...]
                                            Register an upstream
  upstreams list                            List all upstreams
  upstreams delete <id>                     Delete an upstream

  migrate                                   Run database migrations

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

    console.error(`Unknown clients subcommand: ${sub ?? '(none)'}`);
    process.exit(1);
  }

  if (command === 'upstreams') {
    const sub = args[1];
    if (sub === 'create') {
      const name = args[2];
      const baseUrl = args[3];
      if (!name || !baseUrl) {
        console.error('Error: name and baseUrl are required');
        process.exit(1);
      }

      let apiKey: string | undefined;
      const headers: Record<string, string> = {};

      for (let i = 4; i < args.length; i++) {
        if (args[i] === '--api-key' && i + 1 < args.length) {
          apiKey = args[++i];
        } else if (args[i] === '--header' && i + 1 < args.length) {
          const [k, ...vs] = args[++i].split('=');
          if (k && vs.length > 0) {
            headers[k] = vs.join('=');
          }
        }
      }

      loadConfig();
      getDb();
      const upstream = createUpstream({
        name,
        baseUrl,
        apiKey: apiKey ?? null,
        headers: Object.keys(headers).length > 0 ? headers : null,
      });
      console.log('Created upstream:');
      console.log(`  id    : ${upstream.id}`);
      console.log(`  name  : ${upstream.name}`);
      console.log(`  baseUrl: ${upstream.baseUrl}`);
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
          baseUrl: r.baseUrl,
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

    console.error(`Unknown upstreams subcommand: ${sub ?? '(none)'}`);
    process.exit(1);
  }

  console.error(`Unknown command: ${command}`);
  process.exit(1);
}

run().catch((err: unknown) => {
  console.error('CLI error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
