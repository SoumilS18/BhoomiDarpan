import dotenv from 'dotenv';
dotenv.config();
import { getSupabase } from '../server/config/supabase';

async function main() {
  const supabase = getSupabase();
  console.log('--- Checking Administrative Units Count ---');
  const { count: states } = await supabase.from('administrative_units').select('*', { count: 'exact', head: true }).eq('unit_type', 'state');
  const { count: districts } = await supabase.from('administrative_units').select('*', { count: 'exact', head: true }).eq('unit_type', 'district');
  const { count: subdistricts } = await supabase.from('administrative_units').select('*', { count: 'exact', head: true }).eq('unit_type', 'sub_district');
  
  console.log({
    states,
    districts,
    subdistricts,
  });
}

main().catch(console.error);
