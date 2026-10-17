# Local content studio

Run the owner-only writing and upload tool from the repository:

```sh
npm run content:studio
```

Open the local launch link printed in the terminal. Leave that command running while editing; Ctrl+C closes the tool. The default address is `http://127.0.0.1:5186`. The full launch link carries a temporary session key that is exchanged for a local browser session and removed from the address bar. A new server run prints a new link.

The tool uses the existing R2 upload credentials stored in this Mac's Keychain: service `personal-fitness-content-r2`, account `personal-fitness-site`. It also supports the existing `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY` environment variables. Credentials are read by the local server and never sent to the browser or saved in the repository. No additional Cloudflare token is needed.

The server binds to `127.0.0.1` only. It checks the request host and origin, requires a session for content APIs, and protects mutations with a CSRF token. The studio's code and assets are outside the public site and are not deployed with the Worker.

## Write and save

1. Select an existing entry, or start a new journal entry or training article.
2. Enter the title, date, category, summary, and Markdown body. A new entry's URL slug can be edited before the first save; existing URLs stay fixed. Reading time is calculated automatically.
3. Add photographs or videos, describe each one, and arrange their order. Supported uploads are JPEG, PNG, WebP, GIF, AVIF, MP4, and WebM, up to 100 MiB per file. The server validates the file type and stores media under content hashes.
4. Use Preview to check Markdown and media, then choose **Save locally**.

Saving updates the editable content library at `~/Documents/personal-fitness-content`, with metadata and Markdown files under `posts/` and media under `media/`. Previous local versions are retained. Editing conflicts are reported instead of overwriting a newer version from another window or process.

The library remains outside Git. Saving does not upload anything to Cloudflare. Removing an attachment from the editor does not delete its stored media file.

## Publish a saved library

Select **Dev** first, then publish the library. This publishes all saved entries and articles, including edits made outside the studio. Unsaved changes must be saved or discarded first. Uploads and checks run in the background of the local server; keep it running until the result appears.

Check the [development site](https://personal-fitness-dev.luke-edwards20.workers.dev), then select **Main** and publish when ready for production.

| Target | R2 bucket | Website |
| --- | --- | --- |
| Dev | `personal-fitness-content-dev` | [Development](https://personal-fitness-dev.luke-edwards20.workers.dev) |
| Main | `personal-fitness-content-production` | [Production](https://personal-fitness-production.luke-edwards20.workers.dev) |

Each target is separate. Publishing verifies media and the catalog before atomically activating the release. The tools retain older remote objects and releases. Code deployments do not publish content.

Use the backup action for the selected lane to download a checksum-verified snapshot into the local library's `backups/` directory. Backups do not replace editable writing or earlier snapshots.

## Other locations and ports

```sh
npm run content:studio -- --workspace /absolute/path/to/external-library --port 5187
```

`FITNESS_CONTENT_DIR` can also select the workspace. Content workspaces must be outside every Git working tree, and symbolic links are rejected. The CLI does not accept an external listen address.

If the session expires after a restart, reopen the current link from the terminal. If credentials are unavailable, restore the existing Keychain item or supply both environment variables, then restart. Failed publishes can be retried without removing existing remote content.
