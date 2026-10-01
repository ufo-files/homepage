# Live archive inventory

The homepage polls the public `live-inventory` branch once per minute. That branch
holds data only and does not redeploy the homepage on each update.

On the archive Mac, run `python3 scripts/install_live_inventory.py`. It installs
`com.ufo-files.live-inventory` as a LaunchAgent and copies the worker into
`~/Library/Application Support/ufo-files/live-inventory`. The job starts at login,
restarts after a crash, and uses a lock to prevent duplicate scanners. GitHub CLI
must already be authenticated with write access to `ufo-files/homepage`.

Two independent workers check collections without taking processor/publisher
locks. Each collection is eligible for another check 15 minutes after completion;
large scans may take longer. Finished checks are published at most once per minute.
State survives restarts. A failed check preserves its previous timestamp and
values; a failed upload retries. No archive files are modified.

Each source has `checkedAt`. The UI marks checks older than one hour as overdue
and retains the last known count. Catalog-derived records/words continue to
refresh from the latest published research catalog, so they reflect deployed
searchable data rather than unprocessed downloads. These are automatically
refreshed measurements, not instantaneous filesystem events.

Logs: `~/Library/Logs/ufo-files/live-inventory.log`.
