import { useState } from 'react'
import { LogOut, Menu, X } from 'lucide-react'
import './Navbar.css'

function Navbar({ activePage, setActivePage, onLogout }) {
    const [isOpen, setIsOpen] = useState(false);

    const toggleMenu = () => setIsOpen(!isOpen);

    const handleNavClick = (page) => {
        setActivePage(page);
        setIsOpen(false);
    };

    return (
        <nav className="navbar">
            <div className="navbar-brand">Momentra</div>

            <button className="hamburger" onClick={toggleMenu} aria-label="Toggle menu">
                {isOpen ? <X size={24} /> : <Menu size={24} />}
            </button>

            <div className={`navbar-links ${isOpen ? 'open' : ''}`}>
                <button
                    className={`nav-link ${activePage === 'create' ? 'active' : ''}`}
                    onClick={() => handleNavClick('create')}
                >
                    Create
                </button>
                <button
                    className={`nav-link ${activePage === 'templates' ? 'active' : ''}`}
                    onClick={() => handleNavClick('templates')}
                >
                    Templates
                </button>
                <button
                    className={`nav-link ${activePage === 'preferences' ? 'active' : ''}`}
                    onClick={() => handleNavClick('preferences')}
                >
                    Preferences
                </button>
                <button className="nav-logout mobile-only" onClick={onLogout}>
                    <LogOut size={16} />
                    Logout
                </button>
            </div>

            <button className="nav-logout desktop-only" onClick={onLogout}>
                <LogOut size={16} />
                Logout
            </button>
        </nav>
    )
}

export default Navbar
