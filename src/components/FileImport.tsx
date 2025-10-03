import { useRef } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import * as XLSX from "xlsx";
import { toast } from "@/components/ui/sonner";

interface FileImportProps {
  onImport: (data: { sheetName: string; headers: string[]; rows: string[][] }[]) => void;
  children?: React.ReactNode;
}

export const FileImport = ({ onImport, children }: FileImportProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);

      // Process all sheets
      const allSheets: { sheetName: string; headers: string[]; rows: string[][] }[] = [];

      for (const sheetName of workbook.SheetNames) {
        const worksheet = workbook.Sheets[sheetName];

        // Convert to array of arrays
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as unknown[][];

        if (jsonData.length === 0) {
          continue; // Skip empty sheets
        }

        // First row as headers
        const headers = (jsonData[0] as unknown[]).map((cell, idx) =>
          cell ? String(cell) : `COLUMN_${idx + 1}`
        );

        // Rest as data rows, convert all cells to strings
        const rows = jsonData.slice(1).map(row =>
          (row as unknown[]).map(cell => cell != null ? String(cell) : "")
        );

        allSheets.push({
          sheetName: sheetName || `Sheet ${allSheets.length + 1}`,
          headers,
          rows,
        });
      }

      if (allSheets.length === 0) {
        toast("The file appears to be empty.");
        return;
      }

      onImport(allSheets);

      const totalRows = allSheets.reduce((sum, sheet) => sum + sheet.rows.length, 0);
      toast(`Imported ${allSheets.length} sheet(s) with ${totalRows} total rows from ${file.name}`);
    } catch (error) {
      console.error("Error importing file:", error);
      toast("Failed to import file. Please check the file format.");
    }

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.xlsx,.xls,.ods,.tsv"
        onChange={handleFileSelect}
        className="hidden"
      />
      {children ? (
        <div onClick={() => fileInputRef.current?.click()}>
          {children}
        </div>
      ) : (
        <Button
          onClick={() => fileInputRef.current?.click()}
          variant="outline"
          size="sm"
        >
          <Upload className="w-4 h-4 mr-2" />
          Import
        </Button>
      )}
    </>
  );
};