import { Link, NavLink, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';

export default function Nav() {
  const location = useLocation();
  const isInner = location.pathname.startsWith('/predict') || location.pathname.startsWith('/dashboard');
  const [scrolled, setScrolled] = useState<boolean>(isInner);

  useEffect(() => {
    if (isInner) {
      setScrolled(true);
      return;
    }
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, [isInner]);

  return (
    <header className={`nav${scrolled ? ' scrolled' : ''}`}>
      <div className="nav-inner">
        <Link to="/" className="brand">
          <span className="brand-mark">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 21s-7-4.5-9.5-9C0.5 8 3 4 7 4c2 0 3.5 1 5 3 1.5-2 3-3 5-3 4 0 6.5 4 4.5 8-2.5 4.5-9.5 9-9.5 9z" />
            </svg>
          </span>
          <span className="brand-name">Cardio<span>Predict</span></span>
        </Link>

        <ul className="nav-links">
          <li><a href={isInner ? '/#features' : '#features'}>Plataforma</a></li>
          <li><a href={isInner ? '/#architecture' : '#architecture'}>Arquitectura</a></li>
          <li>
            <NavLink to="/dashboard" className={({ isActive }) => isActive ? 'active' : ''}>
              Dashboard
            </NavLink>
          </li>
          <li>
            <NavLink to="/predict" className={({ isActive }) => isActive ? 'active' : ''}>
              Predecir
            </NavLink>
          </li>
        </ul>
      </div>
    </header>
  );
}
