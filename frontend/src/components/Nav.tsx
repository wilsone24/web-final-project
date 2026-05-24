import { Link, NavLink, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';

export default function Nav() {
  const location = useLocation();
  const isInner =
    location.pathname.startsWith('/predict')   ||
    location.pathname.startsWith('/dashboard') ||
    location.pathname.startsWith('/pipeline');

  const [scrolled, setScrolled] = useState<boolean>(isInner);
  const [menuOpen, setMenuOpen] = useState<boolean>(false);

  // Scroll-driven "scrolled" state for the glass bg on the landing.
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

  // Close the mobile menu whenever the route changes (link clicked).
  useEffect(() => { setMenuOpen(false); }, [location.pathname, location.hash]);

  // Close on Escape, and lock body scroll while the drawer is open.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [menuOpen]);

  return (
    <header className={`nav${scrolled ? ' scrolled' : ''}${menuOpen ? ' menu-open' : ''}`}>
      <div className="nav-inner">
        <Link to="/" className="brand">
          <span className="brand-mark">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 21s-7-4.5-9.5-9C0.5 8 3 4 7 4c2 0 3.5 1 5 3 1.5-2 3-3 5-3 4 0 6.5 4 4.5 8-2.5 4.5-9.5 9-9.5 9z" />
            </svg>
          </span>
          <span className="brand-name">Card<span>IA</span>c</span>
        </Link>

        {/* Hamburger / close toggle — hidden on desktop via CSS media query */}
        <button
          type="button"
          className={`nav-toggle${menuOpen ? ' is-open' : ''}`}
          aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'}
          aria-expanded={menuOpen}
          aria-controls="primary-navigation"
          onClick={() => setMenuOpen((o) => !o)}
        >
          <span /><span /><span />
        </button>

        <ul id="primary-navigation" className={`nav-links${menuOpen ? ' is-open' : ''}`}>
          <li><a href={isInner ? '/#features'     : '#features'}     onClick={() => setMenuOpen(false)}>Plataforma</a></li>
          <li><a href={isInner ? '/#architecture' : '#architecture'} onClick={() => setMenuOpen(false)}>Arquitectura</a></li>
          <li>
            <NavLink to="/pipeline" className={({ isActive }) => isActive ? 'active' : ''}>
              Pipeline
            </NavLink>
          </li>
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

      {/* Backdrop sits behind the drawer but in front of the page content */}
      {menuOpen && <div className="nav-backdrop" onClick={() => setMenuOpen(false)} aria-hidden />}
    </header>
  );
}
