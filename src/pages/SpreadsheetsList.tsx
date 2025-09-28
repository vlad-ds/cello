import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Folder, Calendar } from "lucide-react";
import { dataClient, type SpreadsheetRecord } from "@/integrations/database";
import { useNavigate } from "react-router-dom";

const SpreadsheetsList = () => {
  const [spreadsheets, setSpreadsheets] = useState<SpreadsheetRecord[]>([]);
  const [newSpreadsheetName, setNewSpreadsheetName] = useState("");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
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
      <div className="container mx-auto py-8 px-4">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-foreground">My Spreadsheets</h1>
            <p className="text-muted-foreground mt-2">
              Create and manage your interactive spreadsheets
            </p>
          </div>
          
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button className="flex items-center gap-2">
                <Plus className="w-4 h-4" />
                New Spreadsheet
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Spreadsheet</DialogTitle>
                <DialogDescription>
                  Enter a name for your new spreadsheet. You can always rename it later.
                </DialogDescription>
              </DialogHeader>
              <div className="py-4">
                <Label htmlFor="name">Spreadsheet Name</Label>
                <Input
                  id="name"
                  value={newSpreadsheetName}
                  onChange={(e) => setNewSpreadsheetName(e.target.value)}
                  placeholder="Enter spreadsheet name..."
                  className="mt-2"
                  onKeyDown={(e) => e.key === 'Enter' && createSpreadsheet()}
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={createSpreadsheet} disabled={!newSpreadsheetName.trim()}>
                  Create
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {spreadsheets.length === 0 ? (
          <div className="text-center py-16">
            <Folder className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-foreground mb-2">No spreadsheets yet</h2>
            <p className="text-muted-foreground mb-6">
              Create your first spreadsheet to get started with data management
            </p>
            <Button onClick={() => setIsCreateDialogOpen(true)} className="flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Create First Spreadsheet
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {spreadsheets.map((spreadsheet) => (
              <Card 
                key={spreadsheet.id} 
                className="cursor-pointer hover:shadow-lg transition-shadow"
                onClick={() => navigate(`/spreadsheet/${spreadsheet.id}`)}
              >
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Folder className="w-5 h-5 text-primary" />
                    {spreadsheet.name}
                  </CardTitle>
                  <CardDescription className="font-mono text-xs">
                    ID: {spreadsheet.id}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="w-4 h-4" />
                    <span>Updated: {formatDate(spreadsheet.updated_at)}</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Created: {formatDate(spreadsheet.created_at)}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default SpreadsheetsList;
