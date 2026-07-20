# Deploy Manticore on Unraid

This guide moves an existing Manticore installation to Unraid without losing its SQLite data. It also covers publishing the image to Docker Hub, installing an Unraid template, authenticating ChatGPT Codex, backups, and upgrades.

## Before you begin

Replace these placeholders throughout the guide:

| Placeholder | Example |
| --- | --- |
| `YOUR_DOCKERHUB_USER` | `janedoe` |
| `YOUR_UNRAID_IP` | `192.168.1.20` |
| `DESKTOP_DB_PATH` | `/home/jane/manticore/manticore.db` |

You need:

- Docker and access to this repository on the desktop
- A Docker Hub account
- SSH or terminal access to Unraid
- The Community Applications plugin is optional; a local user template works without it

The persistent Unraid files will live in:

```text
/mnt/user/appdata/manticore/
├── manticore.db
└── manticore.env
```

The whole directory is mounted at `/data` because SQLite WAL mode creates `manticore.db-wal` and `manticore.db-shm` beside the main database while Manticore is running.

## 1. Publish the Docker image

Log in to Docker Hub from the desktop:

```bash
docker login
```

From the Manticore repository, build and publish a versioned image. Replace `0.1.0` with the release version being deployed:

```bash
docker buildx build \
  --platform linux/amd64 \
  --tag YOUR_DOCKERHUB_USER/manticore:0.1.0 \
  --tag YOUR_DOCKERHUB_USER/manticore:latest \
  --push \
  .
```

Most Unraid servers are `linux/amd64`. To publish for both x86-64 and ARM64 hosts instead, use:

```bash
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  --tag YOUR_DOCKERHUB_USER/manticore:0.1.0 \
  --tag YOUR_DOCKERHUB_USER/manticore:latest \
  --push \
  .
```

Confirm that the repository and tags appear in Docker Hub before continuing. A public repository is simplest. If it is private, authenticate Unraid to Docker Hub from the Unraid terminal with `docker login` before installing the container.

## 2. Prepare the Unraid appdata directory

In an Unraid terminal:

```bash
mkdir -p /mnt/user/appdata/manticore
```

Create the environment file:

```bash
cat > /mnt/user/appdata/manticore/manticore.env <<'EOF'
MANTICORE_HOST=0.0.0.0
MANTICORE_PORT=3456
MANTICORE_DB_PATH=/data/manticore.db
MANTICORE_LOG_LEVEL=info
NODE_ENV=production
EOF
```

Restrict access because configuration files and the database may contain sensitive information:

```bash
chmod 600 /mnt/user/appdata/manticore/manticore.env
```

Manticore reads values from the process environment; it does not load a mounted `.env` file itself. The Unraid template below passes this host file to Docker using `--env-file`.

## 3. Back up the desktop SQLite database safely

Manticore uses SQLite WAL mode. Do **not** copy only `manticore.db` while Manticore is running, because recently committed data may still be in `manticore.db-wal`.

First find the database path. For a systemd user service:

```bash
systemctl --user cat manticore.service
```

For a system service:

```bash
sudo systemctl cat manticore.service
```

Look for `MANTICORE_DB_PATH` and `WorkingDirectory`. If `MANTICORE_DB_PATH` is absent, the default is `manticore.db` relative to the service working directory.

Stop clients from sending requests, then stop the old instance. Use the command appropriate for the installation:

```bash
systemctl --user stop manticore.service
```

or:

```bash
sudo systemctl stop manticore.service
```

Set the actual path and check database integrity:

```bash
DB="DESKTOP_DB_PATH"
sqlite3 "$DB" 'PRAGMA wal_checkpoint(TRUNCATE); PRAGMA integrity_check;'
```

The output must end with `ok`. Create a standalone SQLite backup and verify it:

```bash
rm -f /tmp/manticore.db
sqlite3 "$DB" ".backup '/tmp/manticore.db'"
sqlite3 /tmp/manticore.db 'PRAGMA integrity_check;'
```

Again, the integrity check must return `ok`. Keep the desktop Manticore instance stopped after this point so it cannot receive writes that are missing from the Unraid copy.

If the `sqlite3` command is unavailable, install your distribution's SQLite CLI package before continuing.

## 4. Copy the database to Unraid

From the desktop:

```bash
scp /tmp/manticore.db \
  root@YOUR_UNRAID_IP:/mnt/user/appdata/manticore/manticore.db
```

On Unraid, create a pre-start backup and check the copied database:

```bash
cp /mnt/user/appdata/manticore/manticore.db \
  /mnt/user/appdata/manticore/manticore.db.pre-unraid

sqlite3 /mnt/user/appdata/manticore/manticore.db \
  'PRAGMA integrity_check;'
```

Do not continue unless the output is `ok`.

## 5. Create the Unraid Docker template

Create the user-template directory in an Unraid terminal:

```bash
mkdir -p /boot/config/plugins/dockerMan/templates-user
```

Create `/boot/config/plugins/dockerMan/templates-user/my-manticore.xml` with the following contents. Replace both occurrences of `YOUR_DOCKERHUB_USER`. Pinning the version rather than using `latest` makes upgrades deliberate and reversible.

```xml
<?xml version="1.0"?>
<Container version="2">
  <Name>Manticore</Name>
  <Repository>YOUR_DOCKERHUB_USER/manticore:0.1.0</Repository>
  <Registry>https://hub.docker.com/r/YOUR_DOCKERHUB_USER/manticore</Registry>
  <Network>bridge</Network>
  <MyIP/>
  <Shell>sh</Shell>
  <Privileged>false</Privileged>
  <Support>https://github.com/cpave3/manticore</Support>
  <Project>https://github.com/cpave3/manticore</Project>
  <Overview>Self-hosted OpenAI-compatible proxy with usage tracking and a dashboard.</Overview>
  <Category>Network:Other Productivity:</Category>
  <WebUI>http://[IP]:[PORT:3456]/</WebUI>
  <TemplateURL/>
  <Icon/>
  <ExtraParams>--restart unless-stopped --env-file=/mnt/user/appdata/manticore/manticore.env</ExtraParams>
  <PostArgs/>
  <CPUset/>

  <Config
    Name="Web UI and API"
    Target="3456"
    Default="3456"
    Mode="tcp"
    Description="Manticore dashboard and OpenAI-compatible API port"
    Type="Port"
    Display="always"
    Required="true"
    Mask="false">3456</Config>

  <Config
    Name="Application Data"
    Target="/data"
    Default="/mnt/user/appdata/manticore"
    Mode="rw"
    Description="Persistent SQLite database storage"
    Type="Path"
    Display="always"
    Required="true"
    Mask="false">/mnt/user/appdata/manticore</Config>
</Container>
```

The `manticore.env` file is passed directly to the Docker daemon with `--env-file`; it does not need a container volume mapping. The `/data` mapping persists the database and its WAL files.

### Optional: download the template from GitHub

If this XML is committed separately as `unraid/manticore.xml`, install it directly with:

```bash
curl -fsSL \
  https://raw.githubusercontent.com/cpave3/manticore/main/unraid/manticore.xml \
  -o /boot/config/plugins/dockerMan/templates-user/my-manticore.xml
```

The URL only works after that file has been committed and pushed to GitHub. This deployment guide itself does not create a downloadable XML at that path.

## 6. Install and start Manticore

In the Unraid web interface:

1. Open **Docker**.
2. Select **Add Container**.
3. Select **Manticore** under **User Templates**.
4. Confirm the repository tag, host port `3456`, and appdata path.
5. Select **Apply**.

Unraid pulls the Docker Hub image and starts the container. Manticore automatically applies included database migrations at startup.

Follow the startup logs from an Unraid terminal:

```bash
docker logs --follow Manticore
```

Look for `Migrations applied.` and the Manticore startup banner. Press Ctrl-C to stop following logs; this does not stop the container.

Confirm the effective mounts and environment:

```bash
docker inspect Manticore --format '{{json .Mounts}}'
docker exec Manticore printenv | grep '^MANTICORE_'
```

Open the dashboard over the LAN or VPN:

```text
http://YOUR_UNRAID_IP:3456/
```

Confirm that the existing clients, upstreams, mappings, credentials, and request history are present. Update API clients to use the Unraid LAN or VPN address only after this verification.

Do not expose port `3456` directly to the public internet. Manticore currently relies on the surrounding network or VPN as its security boundary.

## 7. Authenticate ChatGPT Codex

Credentials are stored in the same SQLite database. If the migrated desktop database was already authenticated, check its status first:

```bash
docker exec -it Manticore \
  node dist/cli.js codex status
```

If authentication is required, use the device-code flow:

```bash
docker exec -it Manticore \
  node dist/cli.js codex login --device-code
```

The command prints a URL and a short code. Open that URL on the laptop, enter the code, and complete authentication. Keep the terminal command running while doing so. Manticore then stores the access and refresh tokens in `/data/manticore.db`.

Verify afterward:

```bash
docker exec -it Manticore \
  node dist/cli.js codex status
```

Do not use the default `codex login` browser flow from inside Docker. Its callback listens on `127.0.0.1:1455` inside the container, while the browser's `localhost` refers to the laptop. The device-code flow avoids that networking mismatch.

## 8. Back up Manticore on Unraid

A plain copy of a running WAL-mode database is unsafe. Either stop the container before copying the appdata directory or use SQLite's online backup command.

### Simple stopped-container backup

```bash
docker stop Manticore
sqlite3 /mnt/user/appdata/manticore/manticore.db \
  'PRAGMA wal_checkpoint(TRUNCATE); PRAGMA integrity_check;'
cp /mnt/user/appdata/manticore/manticore.db \
  "/mnt/user/appdata/manticore/manticore.db.backup-$(date +%F-%H%M%S)"
docker start Manticore
```

### Online backup without stopping Manticore

```bash
sqlite3 /mnt/user/appdata/manticore/manticore.db \
  ".backup '/mnt/user/appdata/manticore/manticore.db.backup'"
sqlite3 /mnt/user/appdata/manticore/manticore.db.backup \
  'PRAGMA integrity_check;'
```

Copy completed backup files to another machine or backup destination. A backup stored only on the same Unraid pool does not protect against pool failure.

## 9. Upgrade Manticore

First publish a new immutable tag, for example `0.2.0`, using the build command from step 1.

Before upgrading:

1. Make and verify a database backup.
2. Edit the Manticore container in Unraid.
3. Change the repository from `YOUR_DOCKERHUB_USER/manticore:0.1.0` to `YOUR_DOCKERHUB_USER/manticore:0.2.0`.
4. Select **Apply**.
5. Check `docker logs --follow Manticore` for migration or startup failures.
6. Verify the dashboard and one API request.

Manticore runs database migrations automatically when the new container starts. Do not run `drizzle-kit` on Unraid.

Rolling the image tag back does not necessarily roll back database migrations. Keep the pre-upgrade database backup until the new version has been verified.

## Troubleshooting

### The template does not appear

Refresh the Docker page and confirm the file exists:

```bash
ls -l /boot/config/plugins/dockerMan/templates-user/my-manticore.xml
```

Then choose **Add Container** and inspect the **Template** dropdown under User Templates.

### Docker cannot pull the image

Confirm the image and tag exist on Docker Hub. For a private repository, run this on Unraid and provide a Docker Hub access token when prompted:

```bash
docker login
```

### Manticore starts with an empty database

Check that both sides of the mount are correct:

```bash
docker inspect Manticore --format '{{range .Mounts}}{{println .Source "->" .Destination}}{{end}}'
```

It must show:

```text
/mnt/user/appdata/manticore -> /data
```

Also check:

```bash
docker exec Manticore printenv MANTICORE_DB_PATH
```

It must print `/data/manticore.db`.

### Permission denied opening the database

Inspect the container logs and host directory:

```bash
docker logs Manticore
ls -la /mnt/user/appdata/manticore
```

The container currently runs as its image-default user, which is `root` in the supplied Dockerfile. The directory and database must therefore be readable and writable by root.

### Port 3456 is already in use

Edit the Unraid container and change only the host-side port, for example from `3456` to `3457`. Keep the container target at `3456`, then open:

```text
http://YOUR_UNRAID_IP:3457/
```

### Codex device login fails

Confirm that the container has outbound internet and rerun the command:

```bash
docker exec Manticore node -e \
  "fetch('https://auth.openai.com').then(r => console.log(r.status)).catch(e => { console.error(e); process.exit(1) })"

docker exec -it Manticore node dist/cli.js codex login --device-code
```

The device code expires after 15 minutes, so restart the login if it times out.
