import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { action, sheetId, row, col, value, columnCount } = await req.json();
    console.log('Received request:', { action, sheetId, row, col, value, columnCount });

    const tableName = `sheet_${sheetId}`;

    switch (action) {
      case 'create_table':
        // Create dynamic table for sheet data
        const createQuery = `
          CREATE TABLE IF NOT EXISTS ${tableName} (
            row_number INTEGER NOT NULL,
            ${Array.from({ length: columnCount }, (_, i) => `column_${i + 1} TEXT`).join(', ')},
            PRIMARY KEY (row_number)
          )
        `;
        
        const { error: createError } = await supabase.rpc('execute_sql', { 
          query: createQuery 
        });
        
        if (createError) throw createError;
        
        console.log(`Created table ${tableName}`);
        return new Response(
          JSON.stringify({ success: true, tableName }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

      case 'update_cell':
        // First ensure table exists
        const columnName = `column_${col + 1}`;
        
        // Try to insert or update the row
        const upsertQuery = `
          INSERT INTO ${tableName} (row_number, ${columnName})
          VALUES (${row + 1}, '${value.replace(/'/g, "''")}')
          ON CONFLICT (row_number)
          DO UPDATE SET ${columnName} = '${value.replace(/'/g, "''")}'
        `;
        
        const { error: upsertError } = await supabase.rpc('execute_sql', { 
          query: upsertQuery 
        });
        
        if (upsertError) throw upsertError;
        
        console.log(`Updated cell ${columnName} in row ${row + 1} of ${tableName}`);
        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

      case 'load_data':
        // Load all data from the sheet table
        const { data: tableData, error: loadError } = await supabase
          .from(tableName)
          .select('*')
          .order('row_number');
        
        if (loadError) {
          // Table might not exist yet
          console.log(`Table ${tableName} doesn't exist yet`);
          return new Response(
            JSON.stringify({ data: [] }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        return new Response(
          JSON.stringify({ data: tableData || [] }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

      default:
        throw new Error(`Unknown action: ${action}`);
    }

  } catch (error) {
    console.error('Error in manage-sheet-data:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});