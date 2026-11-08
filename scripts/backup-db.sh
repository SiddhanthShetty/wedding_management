#!/usr/bin/env bash
# Backs up the linked Supabase project (wedding_management) to a dated folder OUTSIDE this repository:
# database roles, schema and data, plus uploaded documents from the private wedding-documents bucket.
# The files contain guests' personal details: keep them on an encrypted disk, never in git or chat.
#
# Usage:  npm run backup                 (saves under ~/Wedding backups)
#         BACKUP_ROOT=/Volumes/Safe npm run backup
set -euo pipefail

repo="$(cd "$(dirname "$0")/.." && pwd)"
root="${BACKUP_ROOT:-$HOME/Wedding backups}"
case "$(cd "$(dirname "$root")" 2>/dev/null && pwd)/$(basename "$root")/" in
  "$repo"/*) echo "Refusing to save backups inside the repository ($repo). Choose BACKUP_ROOT elsewhere." >&2; exit 1 ;;
esac

stamp="$(date +%Y-%m-%d_%H%M%S)"
dir="$root/$stamp"
umask 077
mkdir -p "$dir/storage"
cd "$repo"

echo "Backing up the linked Supabase project to: $dir"
npx supabase db dump --remote --role-only -f "$dir/roles.sql"
npx supabase db dump --remote -f "$dir/schema.sql"
npx supabase db dump --remote --data-only --use-copy -f "$dir/data.sql"

# Uploaded documents. A missing or empty bucket is not an error.
if ! npx supabase storage cp --remote --experimental -r "ss:///wedding-documents" "$dir/storage/wedding-documents" >/dev/null 2>"$dir/storage-copy.log"; then
  echo "Note: documents could not be copied (see storage-copy.log). The database backup is still complete." >&2
fi

for file in roles.sql schema.sql data.sql; do
  [ -s "$dir/$file" ] || { echo "Backup failed: $file is empty." >&2; exit 1; }
done
(cd "$dir" && find . -type f ! -name SHA256SUMS -print0 | sort -z | xargs -0 shasum -a 256 > SHA256SUMS)
chmod -R go-rwx "$dir"

echo
echo "Done. $(du -sh "$dir" | cut -f1) in $dir"
echo "Files: roles.sql, schema.sql, data.sql, storage/, SHA256SUMS"
echo "Restore drill and steps: docs/backup-restore.md"
