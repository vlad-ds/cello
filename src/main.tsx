import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Toaster } from '@/components/ui/sonner'
import SpreadsheetsList from './pages/SpreadsheetsList'
import SpreadsheetView from './pages/SpreadsheetView'
import Index from './pages/Index'
import NotFound from './pages/NotFound'
import './index.css'

const App = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<SpreadsheetsList />} />
        <Route path="/spreadsheet/:spreadsheetId" element={<SpreadsheetView />} />
        <Route path="/demo" element={<Index />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      <Toaster />
    </BrowserRouter>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
