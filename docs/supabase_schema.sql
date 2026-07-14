-- Supabase PostgreSQL Schema Script
-- Run this in your Supabase SQL Editor to prepare the database for the terminal app.

-- 1. Enable any required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Create the 'perfil' table for managing user permissions authenticated via Firebase Auth
CREATE TABLE IF NOT EXISTS perfil (
  uid TEXT PRIMARY KEY, -- Stores the Firebase Auth UID directly
  email TEXT NOT NULL,
  name TEXT,
  role TEXT DEFAULT 'Pendente' CHECK (role IN ('Coordenador', 'Operador', 'Pendente', 'Administrador')),
  sector TEXT DEFAULT 'Geral',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Create the 'logs' table to persist log entries
CREATE TABLE IF NOT EXISTS logs (
  id DOUBLE PRECISION PRIMARY KEY, -- Using double precision to safely store JavaScript Date.now() + Math.random()
  user_uid TEXT REFERENCES perfil(uid) ON DELETE CASCADE,
  data TEXT NOT NULL,
  dia TEXT NOT NULL,
  semana INTEGER NOT NULL,
  atividade TEXT NOT NULL,
  colaborador TEXT NOT NULL,
  setor TEXT,
  volumes INTEGER NOT NULL,
  horas DOUBLE PRECISION NOT NULL,
  vph TEXT NOT NULL,
  timestamp DOUBLE PRECISION NOT NULL,
  synced BOOLEAN NOT NULL DEFAULT TRUE,
  tipo TEXT NOT NULL CHECK (tipo IN ('direta', 'indireta')), -- 'direta' or 'indireta'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Set up database indexes for fast query performance
CREATE INDEX IF NOT EXISTS idx_logs_user_uid ON logs(user_uid);
CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_perfil_email ON perfil(email);

-- 5. Enable Row Level Security (RLS) if desired (optional)
-- ALTER TABLE perfil ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE logs ENABLE ROW LEVEL SECURITY;
