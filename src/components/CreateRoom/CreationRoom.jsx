import React, { useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';
import { useNavigate } from 'react-router-dom';
import { NavbarComponent } from '../Navbar/Navbar';
import { useToast } from '../../ToastContext';
import { SERVER_URL } from '../../config';
import './create.css';

export const CreationRoom = () => {
    const navigate = useNavigate();
    const toast = useToast();
    const socketRef = useRef(null);
    const [creando, setCreando] = useState(false);

    // Config
    const [categorias, setCategorias] = useState(['Nombre', 'Apellido', 'Animal', 'País', 'Color', 'Fruta', 'Capital']);
    const [item, setItem] = useState('');
    const [letras, setLetras] = useState(
        'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(l => ({ letra: l, activo: true }))
    );
    const [tiempoRonda, setTiempoRonda] = useState(60);
    const [maxJugadores, setMaxJugadores] = useState(8);

    // Socket para crear
    useEffect(() => {
        const s = io(SERVER_URL);
        socketRef.current = s;
        return () => s.disconnect();
    }, []);

    const crearSala = () => {
        if (categorias.length < 3) {
            toast.error('Agrega al menos 3 categorías');
            return;
        }
        const activas = letras.filter(l => l.activo).map(l => l.letra);
        if (activas.length < 5) {
            toast.error('Activa al menos 5 letras');
            return;
        }

        setCreando(true);
        const socket = socketRef.current;

        socket.emit('crear-sala', {
            categorias,
            letras: activas,
            tiempoRonda: Number(tiempoRonda) || 60,
            maxJugadores: Number(maxJugadores) || 8,
        }, (response) => {
            if (response?.ok) {
                toast.success('Sala creada correctamente');
                navigate(`/sala/${response.codigo}`);
            } else {
                toast.error('Error al crear la sala');
                setCreando(false);
            }
        });

        // Fallback si el server no usa callback
        socket.once('sala-creada', (data) => {
            if (data?.ok && data.codigo) {
                navigate(`/sala/${data.codigo}`);
            }
        });

        // Timeout por seguridad
        setTimeout(() => setCreando(false), 5000);
    };

    const agregarCategoria = () => {
        const val = item.trim();
        if (val.length < 2) {
            toast.error('El tema debe tener al menos 2 caracteres');
            return;
        }
        if (categorias.some(c => c.toLowerCase() === val.toLowerCase())) {
            toast.warning('Ese tema ya existe');
            return;
        }
        if (categorias.length >= 15) {
            toast.warning('Máximo 15 categorías');
            return;
        }
        setCategorias([...categorias, val]);
        setItem('');
    };

    const eliminarCategoria = (cat) => setCategorias(categorias.filter(c => c !== cat));
    const toggleLetra = (l) => setLetras(letras.map(x => x.letra === l ? { ...x, activo: !x.activo } : x));
    const activeCount = letras.filter(l => l.activo).length;

    return (
        <div className="create-page">
            <div className="star-field">
                {Array.from({ length: 35 }).map((_, i) => (
                    <div key={i} className="star" style={{
                        left: `${Math.random() * 100}%`, top: `${Math.random() * 100}%`,
                        width: Math.random() * 2 + .5, height: Math.random() * 2 + .5,
                        background: i % 5 === 0 ? 'var(--teal)' : '#fff',
                        animationDuration: `${Math.random() * 3 + 2}s`, animationDelay: `${Math.random() * 5}s`,
                    }} />
                ))}
                <div className="nebula purple"></div>
            </div>

            <NavbarComponent />

            <div className="cr-content">
                <div className="cr-header">
                    <span className="cr-back" onClick={() => navigate('/')}>←</span>
                    <div>
                        <h2 className="cr-title">Configurar Sala</h2>
                        <p className="cr-sub">Personaliza las reglas del juego</p>
                    </div>
                </div>

                {/* Config row: time + max players */}
                <div className="cr-config-row">
                    <div className="card cr-config-item">
                        <label className="lbl">Tiempo por ronda (seg)</label>
                        <div className="time-btns">
                            {[30, 45, 60, 90, 120].map(t => (
                                <button
                                    key={t}
                                    className={`btn sm ${tiempoRonda === t ? '' : 'outline'}`}
                                    onClick={() => setTiempoRonda(t)}
                                >{t}s</button>
                            ))}
                        </div>
                    </div>
                    <div className="card cr-config-item">
                        <label className="lbl">Máx. jugadores</label>
                        <div className="time-btns">
                            {[4, 6, 8, 10].map(n => (
                                <button
                                    key={n}
                                    className={`btn sm ${maxJugadores === n ? '' : 'outline'}`}
                                    onClick={() => setMaxJugadores(n)}
                                >{n}</button>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="cr-grid">
                    {/* Categories */}
                    <div className="card">
                        <div className="card-head">
                            <h3 className="sec-title">TEMAS</h3>
                            <span className="badge badge-purple">{categorias.length}</span>
                        </div>
                        <div className="tags-box">
                            {categorias.map((cat, i) => (
                                <div key={cat} className="tag" style={{ animationDelay: `${i * .02}s` }}>
                                    <span>{cat}</span>
                                    <span className="tag-x" onClick={() => eliminarCategoria(cat)}>×</span>
                                </div>
                            ))}
                        </div>
                        <div className="add-row">
                            <input
                                className="input-s"
                                value={item}
                                onChange={e => setItem(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && agregarCategoria()}
                                placeholder="Agregar tema..."
                                maxLength={30}
                            />
                            <button className="btn sm" onClick={agregarCategoria}>+</button>
                        </div>
                    </div>

                    {/* Letters */}
                    <div className="card">
                        <div className="card-head">
                            <h3 className="sec-title">LETRAS</h3>
                            <span className="badge badge-teal">{activeCount}/{letras.length}</span>
                        </div>
                        <div className="letters-grid">
                            {letras.map(l => (
                                <div
                                    key={l.letra}
                                    className={`letter-cell ${l.activo ? 'on' : 'off'}`}
                                    onClick={() => toggleLetra(l.letra)}
                                >{l.letra}</div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="cr-actions">
                    <button className="btn lg" onClick={crearSala} disabled={creando}>
                        {creando ? 'Creando...' : '🚀 Crear Sala'}
                    </button>
                </div>
            </div>
        </div>
    );
};