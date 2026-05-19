import { Routes, Route, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import BgCanvas from './components/BgCanvas';
import Nav from './components/Nav';
import Footer from './components/Footer';
import Landing from './pages/Landing';
import Predict from './pages/Predict';
import Dashboard from './pages/Dashboard';
import Pipeline from './pages/Pipeline';

export default function App() {
  const location = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [location.pathname]);

  return (
    <>
      <BgCanvas />
      <Nav />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/predict" element={<Predict />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/pipeline" element={<Pipeline />} />
        <Route path="*" element={<Landing />} />
      </Routes>
      <Footer />
    </>
  );
}
