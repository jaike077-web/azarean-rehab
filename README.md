# Azarean Network

Платформа реабилитации для физиотерапевтических студий. Специализация: плечо и колено.

## Setup Instructions

### 1. Clone Repository
```bash
git clone https://github.com/jaike077-web/azarean-rehab.git
cd azarean-rehab
```

### 2. Backend Setup
```bash
cd backend
npm install
```

Create `.env` file from example:
```bash
cp .env.example .env
```

Edit `.env` and fill in your values:
```env
DB_PASSWORD=your_postgres_password
JWT_SECRET=generate-a-random-secret-key
SESSION_SECRET=another-random-secret
```

**Generate random secrets:**
```bash
# On Mac/Linux:
openssl rand -base64 32

# On Windows PowerShell:
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Minimum 0 -Maximum 256 }))
```

### 3. Database Setup

Create database:
```bash
psql -U postgres
CREATE DATABASE azarean_rehab;
\q
```

Run migrations:
```bash
psql -U postgres -d azarean_rehab -f db/migrations/20251224_add_rest_seconds.sql
```

### 4. Start Backend
```bash
npm start
```

### 5. Frontend Setup
```bash
cd frontend
npm install
```

Create `.env` (if needed):
```bash
cp .env.example .env
```

### 6. Start Frontend
```bash
npm start
```

Visit http://localhost:3000

## Security Checklist

Before committing:
- [ ] .env files are in .gitignore
- [ ] .env.example files have NO real secrets
- [ ] All hardcoded secrets removed from code
- [ ] config.js validates required secrets
- [ ] README has setup instructions
- [ ] Run: `git status` - verify .env is NOT staged

## Verify No Secrets in Git History
```bash
# Check if .env was ever committed
git log --all --full-history -- "**/.env"

# If found, need to remove from history (advanced, ask before doing)
```

## Production Deployment

### Environment Variables

On production server, set these environment variables:
```bash
export NODE_ENV=production
export PORT=5000
export DB_HOST=your-production-db-host
export DB_NAME=azarean_rehab_prod
export DB_USER=your-production-db-user
export DB_PASSWORD=your-strong-production-password
export JWT_SECRET=your-very-strong-random-secret
export SESSION_SECRET=another-very-strong-random-secret
export CORS_ORIGIN=https://yourdomain.com
```

**IMPORTANT:** 
- Use strong, randomly-generated secrets in production
- Never commit production .env to git
- Use your hosting provider's environment variable system (Heroku Config Vars, Vercel Environment Variables, etc.)
