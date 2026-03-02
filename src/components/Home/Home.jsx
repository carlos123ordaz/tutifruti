import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { NavbarComponent } from '../Navbar/Navbar';
import { useToast } from '../../ToastContext';
import { SERVER_URL } from '../../config';
import './home.css';

export const Home = () => {
    const [codigo, setCodigo] = useState('');
    const [checking, setChecking] = useState(false);
    const navigate = useNavigate();
    const toast = useToast();
    const socketRef = useRef(null);

    // Socket para verificar sala (fallback si REST falla por CORS)
    useEffect(() => {
        const s = io(SERVER_URL);
        socketRef.current = s;
        return () => s.disconnect();
    }, []);

    // Verificar via REST, con fallback a socket si falla
    const verificarSala = async (code) => {
        // Intento 1: REST (rápido)
        try {
            const res = await fetch(`${SERVER_URL}/sala/${code}`);
            const data = await res.json();
            return data;
        } catch (err) {
            console.warn('REST check failed, trying socket fallback...', err.message);
        }

        // Intento 2: Socket (fallback si CORS bloquea REST)
        return new Promise((resolve) => {
            const socket = socketRef.current;
            if (!socket?.connected) {
                resolve(null); // Sin conexión
                return;
            }

            const timeout = setTimeout(() => resolve(null), 4000);

            socket.emit('verificar-sala', code, (data) => {
                clearTimeout(timeout);
                resolve(data);
            });
        });
    };

    const unirmeSala = async () => {
        const code = codigo.trim();
        if (!code) {
            toast.error('Ingresa el código de la sala');
            return;
        }
        if (!/^\d{4}$/.test(code)) {
            toast.error('El código debe ser de 4 dígitos');
            return;
        }

        setChecking(true);
        try {
            const data = await verificarSala(code);

            if (!data) {
                // No se pudo verificar — dejar que Sala maneje el error
                toast.warning('No se pudo verificar la sala. Intentando conectar...');
                navigate('/sala/' + code);
                return;
            }

            if (!data.existe) {
                toast.error('Esa sala no existe. Verifica el código.');
                return;
            }

            if (data.llena) {
                toast.error('La sala está llena.');
                return;
            }

            navigate('/sala/' + code);
        } catch (err) {
            // En caso de error total, navegar de todas formas
            // (Sala se encargará de mostrar error si la sala no existe)
            toast.warning('Conectando a la sala...');
            navigate('/sala/' + code);
        } finally {
            setChecking(false);
        }
    };

    return (
        <div className="home-page">
            <div className="star-field">
                {Array.from({ length: 55 }).map((_, i) => (
                    <div key={i} className="star" style={{
                        left: `${Math.random() * 100}%`, top: `${Math.random() * 100}%`,
                        width: Math.random() * 2 + .5, height: Math.random() * 2 + .5,
                        background: i % 5 === 0 ? 'var(--teal)' : i % 7 === 0 ? 'var(--purple)' : '#fff',
                        animationDuration: `${Math.random() * 3 + 2}s`, animationDelay: `${Math.random() * 5}s`,
                    }} />
                ))}
                <div className="nebula purple"></div>
                <div className="nebula teal"></div>
            </div>

            <NavbarComponent />

            <div className="home-content">
                <div className="dot-grid"></div>
                <div className="hero">
                    <span className="badge badge-yellow" style={{ marginBottom: 20 }}>⚡ MULTIPLAYER EN TIEMPO REAL</span>
                    <h1 className="hero-title">
                        Demuestra tu <span className="gradient-text">ingenio</span> y rapidez mental
                    </h1>
                    <p className="hero-desc">
                        Desafía a tus amigos en el clásico juego de palabras y categorías.
                        Encuentra palabras únicas antes que nadie.
                    </p>

                    <div className="action-cards">
                        <div className="card glow action-card" onClick={() => navigate('/creation-room')}>
                            <div className="ac-icon" style={{ background: 'var(--purple-dim)' }}>🚀</div>
                            <h3>Crear Sala</h3>
                            <p>Configura categorías, letras y tiempo por ronda</p>
                            <div className="ac-cta">CREAR AHORA →</div>
                        </div>

                        <div className="card action-card">
                            <div className="ac-icon" style={{ background: 'var(--teal-dim)' }}>🎯</div>
                            <h3>Unirse a Sala</h3>
                            <p>Ingresa el PIN que te compartieron</p>
                            <div className="join-form">
                                <input
                                    className="input-s mono"
                                    value={codigo}
                                    onChange={e => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 4))}
                                    onKeyDown={e => e.key === 'Enter' && unirmeSala()}
                                    placeholder="PIN"
                                    maxLength={4}
                                    style={{ textAlign: 'center', fontSize: 20, letterSpacing: '.25em' }}
                                />
                                <button className="btn teal md" onClick={unirmeSala} disabled={checking}>
                                    {checking ? '...' : 'IR'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};