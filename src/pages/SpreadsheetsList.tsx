import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Folder, Upload, Trash2 } from "lucide-react";
import { dataClient, type SpreadsheetRecord } from "@/integrations/database";
import { useNavigate } from "react-router-dom";
import { FileImport } from "@/components/FileImport";
import { toast } from "@/components/ui/sonner";

const SpreadsheetsList = () => {
  const [spreadsheets, setSpreadsheets] = useState<SpreadsheetRecord[]>([]);
  const [newSpreadsheetName, setNewSpreadsheetName] = useState("");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [deleteDialogSpreadsheet, setDeleteDialogSpreadsheet] = useState<SpreadsheetRecord | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetchSpreadsheets();
  }, []);

  const fetchSpreadsheets = async () => {
    try {
      const data = await dataClient.listSpreadsheets();
      setSpreadsheets(data);
    } catch (error) {
      console.error('Error fetching spreadsheets:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const createSpreadsheet = async () => {
    if (!newSpreadsheetName.trim()) return;

    try {
      const spreadsheet = await dataClient.createSpreadsheet(newSpreadsheetName.trim());
      await dataClient.createSheet(spreadsheet.id, 'Sheet 1');

      setNewSpreadsheetName("");
      setIsCreateDialogOpen(false);
      navigate(`/spreadsheet/${spreadsheet.id}`);
    } catch (error) {
      console.error('Error creating spreadsheet:', error);
    }
  };

  const handleFileImport = async (data: { sheetName: string; headers: string[]; rows: string[][] }) => {
    try {
      // Create new spreadsheet with the sheet name
      const spreadsheet = await dataClient.createSpreadsheet(data.sheetName);

      // Create sheet with the same name
      const sheet = await dataClient.createSheet(spreadsheet.id, data.sheetName);

      // Import the data using the backend's sheet sync
      // For now, we'll navigate to the spreadsheet and let SpreadsheetView handle the import
      // Store the import data temporarily and navigate
      sessionStorage.setItem('pendingImport', JSON.stringify({
        spreadsheetId: spreadsheet.id,
        sheetId: sheet.id,
        data
      }));

      navigate(`/spreadsheet/${spreadsheet.id}`);
    } catch (error) {
      console.error('Error importing file as new spreadsheet:', error);
      toast("Failed to create spreadsheet from file.");
    }
  };

  const handleDeleteSpreadsheet = async (spreadsheet: SpreadsheetRecord) => {
    try {
      await dataClient.deleteSpreadsheet(spreadsheet.id);
      setSpreadsheets(prev => prev.filter(s => s.id !== spreadsheet.id));
      toast("Spreadsheet deleted successfully");
      setDeleteDialogSpreadsheet(null);
    } catch (error) {
      console.error('Error deleting spreadsheet:', error);
      toast("Failed to delete spreadsheet");
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground">Loading spreadsheets...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4">
        {/* Centered greeting section */}
        <div className="max-w-4xl mx-auto pt-20 pb-16">
          <h1 className="text-6xl md:text-7xl font-bold text-center mb-6 leading-tight">
            <span className="inline-block text-[#D2691E]">
              Cello
            </span>
            <span className="inline-block ml-3">🎻</span>
          </h1>
          <p className="text-2xl md:text-3xl text-center font-light text-foreground/80 mb-12 max-w-2xl mx-auto leading-relaxed">
            Spreadsheets should <span className="italic font-medium">spark joy</span> ✨
          </p>

          {/* Search/action bar */}
          <div className="relative mb-8">
            <Input
              placeholder="How can I help you today?"
              className="h-14 text-base pl-6 pr-6 rounded-full shadow-sm border-border"
              onClick={() => setIsCreateDialogOpen(true)}
              readOnly
            />
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-center gap-6 flex-wrap">
            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="ghost" className="flex flex-col items-center gap-2 h-auto py-3 px-6 rounded-xl hover:bg-muted">
                  <Plus className="w-5 h-5" />
                  <span className="text-sm">New Sheet</span>
                </Button>
              </DialogTrigger>
              <DialogContent className="rounded-2xl">
                <DialogHeader>
                  <DialogTitle>Create New Spreadsheet</DialogTitle>
                  <DialogDescription>
                    Enter a name for your new spreadsheet
                  </DialogDescription>
                </DialogHeader>
                <div className="py-4">
                  <Input
                    id="name"
                    value={newSpreadsheetName}
                    onChange={(e) => setNewSpreadsheetName(e.target.value)}
                    placeholder="Spreadsheet name..."
                    className="rounded-lg"
                    onKeyDown={(e) => e.key === 'Enter' && createSpreadsheet()}
                    autoFocus
                  />
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)} className="rounded-lg">
                    Cancel
                  </Button>
                  <Button onClick={createSpreadsheet} disabled={!newSpreadsheetName.trim()} className="rounded-lg">
                    Create
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <FileImport onImport={handleFileImport}>
              <Button variant="ghost" className="flex flex-col items-center gap-2 h-auto py-3 px-6 rounded-xl hover:bg-muted">
                <Upload className="w-5 h-5" />
                <span className="text-sm">Import File</span>
              </Button>
            </FileImport>
          </div>
        </div>

        {/* Spreadsheets list */}
        {spreadsheets.length > 0 && (
          <div className="max-w-6xl mx-auto pb-16">
            <h2 className="text-xl font-medium text-foreground mb-6">Recent spreadsheets</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {spreadsheets.map((spreadsheet) => (
                <Card
                  key={spreadsheet.id}
                  className="cursor-pointer hover:shadow-md transition-all group relative rounded-2xl border-border/50"
                  onClick={() => navigate(`/spreadsheet/${spreadsheet.id}`)}
                >
                  <Button
                    variant="ghost"
                    size="sm"
                    className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity z-10 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteDialogSpreadsheet(spreadsheet);
                    }}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-3 pr-8 text-lg font-medium">
                      <div className="p-2 bg-primary/10 rounded-lg">
                        <Folder className="w-5 h-5 text-primary" />
                      </div>
                      {spreadsheet.name}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-sm text-muted-foreground">
                      Updated {formatDate(spreadsheet.updated_at)}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteDialogSpreadsheet} onOpenChange={() => setDeleteDialogSpreadsheet(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Spreadsheet</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteDialogSpreadsheet?.name}"? This action cannot be undone and will permanently delete all sheets and data in this spreadsheet.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteDialogSpreadsheet && handleDeleteSpreadsheet(deleteDialogSpreadsheet)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default SpreadsheetsList;
