-- Create spreadsheets table to store spreadsheet metadata
CREATE TABLE public.spreadsheets (
  id TEXT NOT NULL PRIMARY KEY DEFAULT 'spr_' || substring(replace(gen_random_uuid()::text, '-', ''), 1, 8),
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create sheets table to store sheet metadata within spreadsheets
CREATE TABLE public.sheets (
  id TEXT NOT NULL PRIMARY KEY DEFAULT 'sht_' || substring(replace(gen_random_uuid()::text, '-', ''), 1, 8),
  spreadsheet_id TEXT NOT NULL REFERENCES public.spreadsheets(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(spreadsheet_id, name)
);

-- Enable Row Level Security
ALTER TABLE public.spreadsheets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sheets ENABLE ROW LEVEL SECURITY;

-- Create policies for public access (adjust later for user-specific access if needed)
CREATE POLICY "Allow all operations on spreadsheets" ON public.spreadsheets FOR ALL USING (true);
CREATE POLICY "Allow all operations on sheets" ON public.sheets FOR ALL USING (true);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create triggers for automatic timestamp updates
CREATE TRIGGER update_spreadsheets_updated_at
  BEFORE UPDATE ON public.spreadsheets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_sheets_updated_at
  BEFORE UPDATE ON public.sheets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();