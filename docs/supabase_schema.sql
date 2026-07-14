-- Supabase PostgreSQL Schema Script
-- Run this in your Supabase SQL Editor to prepare the database for the terminal app.

-- 1. Enable any required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Create the 'users' table (compatible with Firebase Auth UID or Custom Auth UID)
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  uid TEXT NOT NULL UNIQUE, -- Stores the Firebase Auth UID or Supabase Auth UID
  email TEXT NOT NULL,
  name TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Create the 'records' table to persist log entries
CREATE TABLE IF NOT EXISTS records (
  id DOUBLE PRECISION PRIMARY KEY, -- Using double precision to safely store JavaScript Date.now() + Math.random()
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
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
CREATE INDEX IF NOT EXISTS idx_records_user_id ON records(user_id);
CREATE INDEX IF NOT EXISTS idx_records_timestamp ON records(timestamp);
CREATE INDEX IF NOT EXISTS idx_users_uid ON users(uid);

-- 5. Enable Row Level Security (RLS) if desired (optional)
-- ALTER TABLE users ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE records ENABLE ROW LEVEL SECURITY;
