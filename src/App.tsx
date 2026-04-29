import { useState } from 'react';
import './index.css';
import Nav from './components/Nav';
import Home from './pages/Home';
import MapPage from './pages/Map';
import Report from './pages/Report';

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
      {page === 'report' && <Report onNavigate={navigate} />}
    </>
  );
}
