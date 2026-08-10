#!/bin/sh
# apps/api/cron/entrypoint.sh — installs the crontab and runs busybox crond
# in the foreground (PID 1), so `docker compose` sees a real long-running
# process and can restart it like any other service.
set -e
crontab /app/apps/api/cron/crontab
exec crond -f -l 2
