import { LogOut } from 'lucide-react'
import './Navbar.css'

function Navbar({ activePage, setActivePage, onLogout }) {
    return (
        <nav className="navbar">
            <div className="navbar-brand">Momentra</div>
            <div className="navbar-links">
                <button
                    className={`nav-link ${activePage === 'create' ? 'active' : ''}`}
                    onClick={() => setActivePage('create')}
                >
                    Create
                </button>
                <button
                    className={`nav-link ${activePage === 'templates' ? 'active' : ''}`}
                    onClick={() => setActivePage('templates')}
                >
                    Templates
                </button>
                <button
                    className={`nav-link ${activePage === 'preferences' ? 'active' : ''}`}
                    onClick={() => setActivePage('preferences')}
                >
                    Preferences
                </button>
            </div>
            <button className="nav-logout" onClick={onLogout}>
                <LogOut size={16} />
                Logout
            </button>
        </nav>
    )
}

export default Navbar
