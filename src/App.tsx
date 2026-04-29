import { useState } from 'react';
import './index.css';
import Nav from './components/Nav';
import Home from './pages/Home';
import MapPage from './pages/Map';
const ReportPage = () => (
  <div style={{ paddingTop: 56, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--text2)' }}>
    Report form coming soon
  </div>
);

export default function App() {
  const [page, setPage] = useState<string>('home');

  const navigate = (p: string) => {
    setPage(p);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <>
      <Nav activePage={page} onNavigate={navigate} />
      {page === 'home'   && <Home onNavigate={navigate} />}
      {page === 'map'    && <MapPage />}
      {page === 'report' && <ReportPage />}
    </>
  );
}