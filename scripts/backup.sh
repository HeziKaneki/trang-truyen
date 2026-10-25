#!/bin/sh
set -eu
umask 077
mkdir -p /backups
backup="/backups/novel-$(date -u +%Y%m%d-%H%M%S).dump"
pg_dump --format=custom --no-owner --file="$backup.tmp"
mv "$backup.tmp" "$backup"
find /backups -maxdepth 1 -type f -name 'novel-*.dump' -mtime +6 -delete
