import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

function checkConfig(key: string, validator: (val: string) => boolean): { configured: boolean; validLooking: boolean } {
  const val = process.env[key]?.trim();
  if (!val || val.length === 0) {
    return { configured: false, validLooking: false };
  }
  const isPlaceholder = 
    val.includes('your-supabase-project') ||
    val.includes('your-supabase-anon-key') ||
    val.includes('your-supabase-service-role-key') ||
    val.includes('your-gemini-api-key') ||
    val.includes('your-database-url') ||
    val.includes('placeholder') ||
    val.includes('example');

  return {
    configured: true,
    validLooking: !isPlaceholder && validator(val)
  };
}

const supabaseUrl = checkConfig('SUPABASE_URL', (v) => v.startsWith('http://') || v.startsWith('https://'));
const supabaseAnon = checkConfig('SUPABASE_ANON_KEY', (v) => v.length > 20);
const supabaseServiceRole = checkConfig('SUPABASE_SERVICE_ROLE_KEY', (v) => v.length > 20);
const geminiKey = checkConfig('GEMINI_API_KEY', (v) => v.length > 10);
const databaseUrl = checkConfig('DATABASE_URL', (v) => v.startsWith('postgres://') || v.startsWith('postgresql://'));

console.log(JSON.stringify({
  SUPABASE_URL: supabaseUrl,
  SUPABASE_ANON_KEY: supabaseAnon,
  SUPABASE_SERVICE_ROLE_KEY: supabaseServiceRole,
  GEMINI_API_KEY: geminiKey,
  DATABASE_URL: databaseUrl
}, null, 2));
