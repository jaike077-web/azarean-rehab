# Database Migrations

## How to run migrations

After cloning the project or pulling updates, run all migrations in order:

### On Windows (PowerShell):
```powershell
# Navigate to backend
cd backend

# Run migration
psql -U postgres -d azarean_rehab -f db/migrations/20251224_add_rest_seconds.sql
```

### On Mac/Linux:
```bash
cd backend
psql -U postgres -d azarean_rehab -f db/migrations/20251224_add_rest_seconds.sql
```

## Migration List

| Date | File | Description |
|------|------|-------------|
| 2025-12-24 | `20251224_add_rest_seconds.sql` | Add rest_seconds column to template_exercises |

## Notes

- Always run migrations in chronological order
- Check migration output for errors
- Migrations use `IF NOT EXISTS` to be idempotent (safe to run multiple times)