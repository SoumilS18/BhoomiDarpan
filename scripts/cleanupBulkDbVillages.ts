import dotenv from 'dotenv';
dotenv.config();
import { getSupabase } from '../server/config/supabase';

async function main() {
  console.log('=== CLEANING UP BULK MIRROR VILLAGES FROM REMOTE SUPABASE POSTGRESQL ===\n');

  const supabase = getSupabase();

  console.log('Checking current unit counts before cleanup...');
  const { count: states } = await supabase.from('administrative_units').select('*', { count: 'exact', head: true }).eq('unit_type', 'state');
  const { count: districts } = await supabase.from('administrative_units').select('*', { count: 'exact', head: true }).eq('unit_type', 'district');
  const { count: subdistricts } = await supabase.from('administrative_units').select('*', { count: 'exact', head: true }).eq('unit_type', 'sub_district');
  const { count: villages } = await supabase.from('administrative_units').select('*', { count: 'exact', head: true }).eq('unit_type', 'village');

  console.log({
    states,
    districts,
    subdistricts,
    villages,
  });

  console.log('\nDeleting temporary bulk mirror village rows state-by-state from PostgreSQL...');
  const { data: stateList } = await supabase.from('administrative_units').select('code').eq('unit_type', 'state');
  let totalDeleted = 0;

  if (stateList && stateList.length > 0) {
    for (const st of stateList) {
      const { data, error } = await supabase
        .from('administrative_units')
        .delete()
        .eq('unit_type', 'village')
        .eq('source_id', 'lgd_reference_mirror')
        .eq('state_code', st.code)
        .select('id');

      if (error) {
        // If state has too many villages (like UP), delete by district in that state
        const { data: distList } = await supabase
          .from('administrative_units')
          .select('code')
          .eq('unit_type', 'district')
          .eq('state_code', st.code);

        if (distList) {
          for (const d of distList) {
            const { data: dData } = await supabase
              .from('administrative_units')
              .delete()
              .eq('unit_type', 'village')
              .eq('source_id', 'lgd_reference_mirror')
              .eq('district_code', d.code)
              .select('id');
            if (dData) totalDeleted += dData.length;
          }
        }
      } else if (data) {
        totalDeleted += data.length;
      }
      console.log(`  State ${st.code}: deleted villages (total so far: ${totalDeleted.toLocaleString()})`);
    }
  }

  console.log(`\nCleanup complete! Total purged from PostgreSQL: ${totalDeleted.toLocaleString()} rows.`);

  const { count: remainingVillages } = await supabase.from('administrative_units').select('*', { count: 'exact', head: true }).eq('unit_type', 'village');
  console.log(`Remaining villages in PostgreSQL (custom/user-created): ${remainingVillages ?? 0}`);
}

main().catch((err) => {
  console.error('Cleanup failed:', err);
  process.exit(1);
});
