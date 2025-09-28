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

      case 'update_cell': {
        const columnName = `column_${col + 1}`;
        const targetRow = Number(row);

        if (!Number.isInteger(targetRow) || targetRow < 0) {
          throw new Error('Row must be a non-negative integer.');
        }

        const sanitizedValue = typeof value === 'string' ? value.replace(/'/g, "''") : '';

        if (sanitizedValue.length === 0) {
          const clearQuery = `
            UPDATE ${tableName}
            SET ${columnName} = NULL
            WHERE row_number = ${targetRow};
          `;

          const { error: clearError } = await supabase.rpc('execute_sql', { query: clearQuery });
          if (clearError) throw clearError;
        } else {
          const upsertQuery = `
            INSERT INTO ${tableName} (row_number, ${columnName})
            VALUES (${targetRow}, '${sanitizedValue}')
            ON CONFLICT (row_number)
            DO UPDATE SET ${columnName} = '${sanitizedValue}'
          `;

          const { error: upsertError } = await supabase.rpc('execute_sql', { query: upsertQuery });
          if (upsertError) throw upsertError;
        }

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

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
        
        const rows = tableData || [];
        const columnNames = rows.length > 0
          ? Object.keys(rows[0]).filter((key) => key.startsWith('column_')).sort()
          : [];

        if (columnNames.length === 0) {
          return new Response(
            JSON.stringify({ data: [] }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const headerSource = rows.find((row) => row.row_number === 1) || {};
        const headerRow: Record<string, unknown> = { row_number: 0 };
        columnNames.forEach((columnName, index) => {
          headerRow[`column_${index + 1}`] = headerSource[columnName] ?? `COLUMN_${index + 1}`;
        });

        const dataRows = rows
          .filter((row) => row.row_number !== 1)
          .map((row) => {
            const record: Record<string, unknown> = {
              row_number: (row.row_number ?? 0) - 1,
            };
            columnNames.forEach((columnName, index) => {
              record[`column_${index + 1}`] = row[columnName];
            });
            return record;
          });

        return new Response(
          JSON.stringify({ data: [headerRow, ...dataRows] }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

      case 'delete_column':
        return new Response(
          JSON.stringify({ error: 'Column removal is only available via the local SQLite backend.' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
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
