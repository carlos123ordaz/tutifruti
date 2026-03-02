import React from 'react';
import { useNavigate } from 'react-router-dom';
import './navbar.css';

export const NavbarComponent = () => {
    const navigate = useNavigate();
    return (
        <nav className="nav-space">
            <div className="nav-inner">
                <div className="nav-brand" onClick={() => navigate('/')}>
                    <div className="nav-logo">TF</div>
                    <span className="nav-title gradient-text">Tutti Frutti</span>
                    <span className="badge badge-teal"><span className="status-dot teal"></span>ONLINE</span>
                </div>
                <div className="nav-links">
                    <span className="nav-link active" onClick={() => navigate('/')}>INICIO</span>
                    <span className="nav-link">¿CÓMO FUNCIONA?</span>
                </div>
            </div>
        </nav>
    );
};