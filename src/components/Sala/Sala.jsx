import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { useToast } from '../../ToastContext';
import { SERVER_URL } from '../../config';
import './sala.css';

const ALL_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const EMOJIS = ['👾', '🛸', '🌟', '🪐', '🔮', '⚡', '🎯', '🦊', '🐙', '🎮'];

export const Sala = () => {
  const { codigo } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  // ── Socket ──
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [connectError, setConnectError] = useState(false);

  // ── UI ──
  const [showNameModal, setShowNameModal] = useState(true);
  const [screen, setScreen] = useState('waiting');
  const [nombre, setNombre] = useState('');
  const [nombreError, setNombreError] = useState('');
  const [joining, setJoining] = useState(false);

  // ── Game data ──
  const [categorias, setCategorias] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [adminId, setAdminId] = useState(null);
  const [letra, setLetra] = useState('?');
  const [isSpinning, setIsSpinning] = useState(false);
  const [timer, setTimer] = useState(null);
  const [tiempoRonda, setTiempoRonda] = useState(60);
  const [entradas, setEntradas] = useState({});
  const [respuestas, setRespuestas] = useState([]);
  const [progreso, setProgreso] = useState(null);
  const [ronda, setRonda] = useState(0);
  const [letrasUsadas, setLetrasUsadas] = useState([]);
  const [resultadosEnviados, setResultadosEnviados] = useState(false);

  // ── Chat ──
  const [mensajes, setMensajes] = useState([]);
  const [textMsg, setTextMsg] = useState('');
  const chatRef = useRef(null);

  // ── Refs for socket handlers ──
  const entradasRef = useRef(entradas);
  const nombreRef = useRef(nombre);
  const categoriasRef = useRef(categorias);
  useEffect(() => { entradasRef.current = entradas; }, [entradas]);
  useEffect(() => { nombreRef.current = nombre; }, [nombre]);
  useEffect(() => { categoriasRef.current = categorias; }, [categorias]);

  const esAdmin = socketRef.current && adminId === socketRef.current.id;

  // ═══════════════════════════════════════
  //  HELPERS
  // ═══════════════════════════════════════

  function initEntradas(cats) {
    const init = {};
    cats.forEach(c => {
      init[c] = {
        id: typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : Math.random().toString(36).slice(2, 10),
        respuesta: '',
        correcto: null,
      };
    });
    setEntradas(init);
    entradasRef.current = init;
  }

  function addSystemMsg(msg) {
    setMensajes(prev => [...prev, { nombre: 'Sistema', mensaje: msg, system: true, timestamp: Date.now() }]);
    setTimeout(() => {
      if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }, 50);
  }


  // ═══════════════════════════════════════
  //  SOCKET
  // ═══════════════════════════════════════

  useEffect(() => {
    const socket = io(SERVER_URL + '/' + codigo, {
      reconnection: true,
      reconnectionAttempts: 15,
      reconnectionDelay: 1000,
      timeout: 8000,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      setConnectError(false);
    });

    socket.on('disconnect', (reason) => {
      setConnected(false);
      if (reason !== 'io client disconnect') {
        toast.warning('Conexión perdida. Reconectando...');
      }
    });

    socket.on('reconnect', () => {
      setConnected(true);
      toast.success('Reconectado');
    });

    socket.on('connect_error', (err) => {
      setConnected(false);
      setConnectError(true);
    });

    // ── Usuarios ──
    socket.on('enviar-usuarios', (data) => {
      setUsuarios(data.usuarios);
      setCategorias(data.categorias);
      setAdminId(data.adminId);
      if (data.letraActual) setLetra(data.letraActual);
      if (data.tiempoRonda) setTiempoRonda(data.tiempoRonda);
      if (data.estado === 'jugando') setScreen('playing');
      else if (data.estado === 'resultados') setScreen('results');
      else setScreen('waiting');
      initEntradas(data.categorias);
    });

    socket.on('actualizar-usuarios', (data) => {
      setUsuarios(data.usuarios);
      setAdminId(data.adminId);
      if (data.desconectado) {
        addSystemMsg(`${data.desconectado} se desconectó`);
      }
    });

    socket.on('admin-cambio', (data) => {
      setAdminId(data.adminId);
      addSystemMsg(`${data.adminNombre} es el nuevo admin`);
      toast.info(`${data.adminNombre} es ahora el administrador`);
    });

    // ── Letra del servidor (todos reciben la misma) ──
    socket.on('letra-elegida', (data) => {
      setIsSpinning(true);
      let i = 0;
      const total = 18;
      const iv = setInterval(() => {
        setLetra(ALL_LETTERS[Math.floor(Math.random() * ALL_LETTERS.length)]);
        i++;
        if (i >= total) {
          clearInterval(iv);
          setLetra(data.letra); // Letra final: la del SERVIDOR
          setIsSpinning(false);
        }
      }, 70);
    });

    // ── Start ──
    socket.on('start', (data) => {
      setLetra(data.letra);
      setRonda(data.ronda);
      setTimer(data.tiempo);
      setScreen('playing');
      setResultadosEnviados(false);
      setProgreso(null);
      setRespuestas([]);
      initEntradas(categoriasRef.current);
      addSystemMsg(`🔥 Ronda ${data.ronda} — Letra ${data.letra}`);
    });

    // ── Timer (del servidor) ──
    socket.on('timer-tick', (data) => {
      setTimer(data.tiempo);
    });

    // ── Detener ──
    socket.on('detener-juego', (data) => {
      setScreen('results');
      setTimer(null);
      // Auto-enviar resultados
      setTimeout(() => {
        const current = { ...entradasRef.current, usuario: nombreRef.current };
        socket.emit('enviar-resultados', current);
        setResultadosEnviados(true);
      }, 100);

      if (data.razon === 'manual') {
        addSystemMsg(`⏹ ${data.detenidoPor} detuvo el juego`);
      } else {
        addSystemMsg('⏱ ¡Se acabó el tiempo!');
      }
    });

    socket.on('progreso-resultados', (data) => setProgreso(data));

    socket.on('enviar-respuestas', (data) => {
      setRespuestas(data);
      setProgreso(null);
    });

    socket.on('corregir-respuesta', (data) => {
      setRespuestas(prev =>
        prev.map(x =>
          x[data.tema]?.id === data.id
            ? { ...x, [data.tema]: { ...x[data.tema], correcto: !x[data.tema].correcto } }
            : x
        )
      );
    });

    socket.on('reiniciar-juego', (data) => {
      setLetra('?');
      setUsuarios(data.usuarios);
      setAdminId(data.adminId);
      setRespuestas([]);
      setScreen('waiting');
      setTimer(null);
      setResultadosEnviados(false);
      setProgreso(null);
      if (data.letrasUsadas) setLetrasUsadas(data.letrasUsadas);
      initEntradas(categoriasRef.current);
      addSystemMsg('🔄 Nueva ronda');
    });

    // Late-join sync
    socket.on('sync-juego', (data) => {
      setLetra(data.letra);
      setTimer(data.tiempoRestante);
      setScreen('playing');
    });

    // ── Chat ──
    socket.on('chat-message', (data) => {
      setMensajes(prev => [...prev, data]);
      setTimeout(() => {
        if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
      }, 50);
    });

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [codigo]);

  // ═══════════════════════════════════════
  //  ACTIONS
  // ═══════════════════════════════════════

  const enviarNombre = useCallback(() => {
    const val = nombre.trim();
    if (val.length < 2) { setNombreError('Mínimo 2 caracteres'); return; }
    if (val.length > 20) { setNombreError('Máximo 20 caracteres'); return; }

    setJoining(true);
    setNombreError('');
    const socket = socketRef.current;

    // FIX #3: Timeout por si el callback nunca llega
    const timeout = setTimeout(() => {
      setJoining(false);
      // Si no hubo respuesta, asumir que el server no soporta callback
      // y verificar si el evento enviar-usuarios llegó
      if (showNameModal) {
        setNombreError('Sin respuesta del servidor. Reintenta.');
        toast.error('Servidor no respondió. ¿Existe esta sala?');
      }
    }, 6000);

    socket.emit('enviar-nombre', val, (res) => {
      clearTimeout(timeout);
      setJoining(false);
      if (res?.ok) {
        setShowNameModal(false);
        addSystemMsg(`¡Bienvenido ${val}! ✨`);
      } else {
        setNombreError(res?.error || 'Error al unirse');
        toast.error(res?.error || 'No se pudo unir a la sala');
      }
    });
  }, [nombre, toast, showNameModal]);

  const girarLetra = useCallback(() => {
    if (!esAdmin || screen !== 'waiting') return;
    socketRef.current.emit('girar-letra', null, (res) => {
      if (!res?.ok) toast.error(res?.error || 'No se pudo girar');
    });
  }, [esAdmin, screen, toast]);

  const iniciarJuego = useCallback(() => {
    if (!esAdmin) return;
    socketRef.current.emit('empezar-juego', null, (res) => {
      if (!res?.ok) toast.error(res?.error || 'No se pudo iniciar');
    });
  }, [esAdmin, toast]);

  const detener = useCallback(() => {
    socketRef.current?.emit('detener');
  }, []);

  const enviarMensaje = useCallback(() => {
    const msg = textMsg.trim();
    if (msg.length === 0 || msg.length > 200) return;
    socketRef.current?.emit('chat-message', { mensaje: msg });
    setTextMsg('');
  }, [textMsg]);

  const activarCorreccion = useCallback((id, tema) => {
    socketRef.current?.emit('correccion', { id, tema });
  }, []);

  const obtenerPuntaje = (rpta) => {
    let c = 0;
    for (let k in rpta) {
      if (k !== 'usuario' && k !== '_socketId' && rpta[k]?.correcto) c++;
    }
    return c;
  };

  const activarReiniciar = useCallback(() => {
    if (!esAdmin) { toast.error('Solo el admin puede'); return; }
    const puntajes = respuestas.map(r => {
      const user = usuarios.find(u => u.nombre === r.usuario);
      return { id: user?.id || '', nombre: r.usuario, puntaje: (user?.puntaje || 0) + obtenerPuntaje(r) };
    });
    socketRef.current?.emit('reiniciar', puntajes);
  }, [esAdmin, respuestas, usuarios, toast]);

  const handleInputChange = (cat, value) => {
    setEntradas(prev => {
      const next = { ...prev, [cat]: { ...prev[cat], respuesta: value } };
      entradasRef.current = next;
      return next;
    });
  };

  const timerColor = timer !== null && timer <= 10 ? 'var(--red)' : 'var(--yellow)';
  const timerPulse = timer !== null && timer <= 10;
  const timerPercent = timer !== null && tiempoRonda ? (timer / tiempoRonda) * 100 : 100;

  // ═══════════════════════════════════════
  //  NAME MODAL
  // ═══════════════════════════════════════

  if (showNameModal) {
    return (
      <div className="sala-page">
        <div className="modal-overlay">
          <div className="card modal-box">
            <div className="dot-grid"></div>
            <div className="modal-inner">
              <div className="modal-icon">👾</div>
              <h3>Unirse a la Sala</h3>
              <span className="badge badge-yellow">SALA #{codigo}</span>

              {!connected && !connectError && (
                <div className="badge badge-muted" style={{ marginTop: 8 }}>
                  Conectando...
                </div>
              )}
              {connectError && (
                <div className="badge badge-red" style={{ marginTop: 8 }}>
                  <span className="status-dot red"></span>
                  Sala no encontrada o servidor caído
                </div>
              )}
              {connected && (
                <div className="badge badge-teal" style={{ marginTop: 8 }}>
                  <span className="status-dot teal"></span>
                  Conectado
                </div>
              )}

              <p className="modal-desc">Escribe tu nombre para entrar</p>

              <input
                className={`input-s ${nombreError ? 'error' : ''}`}
                type="text"
                placeholder="Tu nombre..."
                value={nombre}
                onChange={(e) => { setNombre(e.target.value); setNombreError(''); }}
                onKeyDown={(e) => e.key === 'Enter' && enviarNombre()}
                maxLength={20}
                style={{ textAlign: 'center', fontSize: 16 }}
                autoFocus
                disabled={!connected}
              />
              {nombreError && <p className="field-error">{nombreError}</p>}

              <button
                className="btn md"
                onClick={enviarNombre}
                disabled={joining || !connected || nombre.trim().length < 2}
                style={{ width: '100%', marginTop: 12 }}
              >
                {joining ? 'Entrando...' : !connected ? 'CONECTANDO...' : 'ENTRAR'}
              </button>

              <button
                className="btn sm outline"
                onClick={() => navigate('/')}
                style={{ width: '100%', marginTop: 8, fontSize: 12 }}
              >
                ← Volver al inicio
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════
  //  GAME ROOM
  // ═══════════════════════════════════════

  return (
    <div className="sala-page">
      {/* Top Bar */}
      <div className="s-topbar">
        <div className="s-top-left">
          <span className="s-back" onClick={() => navigate('/')}>←</span>
          <span className="badge badge-purple">SALA #{codigo}</span>
          <span className={`badge ${connected ? 'badge-teal' : 'badge-red'}`}>
            <span className={`status-dot ${connected ? 'teal' : 'red'}`}></span>
            {connected ? `${usuarios.length} jugador${usuarios.length !== 1 ? 'es' : ''}` : 'Sin conexión'}
          </span>
        </div>

        <div
          className={`s-letter ${isSpinning ? 'spinning' : ''} ${letra !== '?' ? 'has' : ''} ${esAdmin && screen === 'waiting' ? 'clickable' : ''}`}
          onClick={girarLetra}
          title={esAdmin && screen === 'waiting' ? 'Girar letra' : ''}
        >
          <span>{letra}</span>
        </div>

        <div className="s-top-right">
          {timer !== null && (
            <div className="timer-box">
              <div className="timer-bar">
                <div className="timer-fill" style={{ width: `${timerPercent}%`, background: timerColor }}></div>
              </div>
              <span className={`timer-num ${timerPulse ? 'pulse' : ''}`} style={{ color: timerColor }}>
                {timer}s
              </span>
            </div>
          )}
          <span className={`badge ${screen === 'playing' ? 'badge-teal' : screen === 'results' ? 'badge-yellow' : 'badge-muted'}`}>
            {screen === 'waiting' && 'ESPERANDO'}
            {screen === 'playing' && '🔥 EN JUEGO'}
            {screen === 'results' && '📋 RESULTADOS'}
          </span>
        </div>
      </div>

      <div className="s-layout">
        {/* Players */}
        <aside className="s-sidebar">
          <p className="s-label">Jugadores</p>
          {usuarios.map((u, i) => {
            const isMe = socketRef.current && u.id === socketRef.current.id;
            const isAdm = u.id === adminId;
            return (
              <div key={u.id} className={`s-player ${isMe ? 'me' : ''} ${isAdm ? 'admin' : ''}`}
                style={{ animationDelay: `${i * .08}s` }}>
                <div className="s-avatar" data-c={i % 4}>{EMOJIS[i % EMOJIS.length]}</div>
                <div className="s-pinfo">
                  <span className="s-pname">{u.nombre}{isMe ? ' (tú)' : ''}</span>
                  <span className="s-pscore">{u.puntaje} pts</span>
                </div>
                {isAdm && <span className="badge badge-yellow" style={{ fontSize: 9, padding: '2px 6px' }}>ADMIN</span>}
              </div>
            );
          })}
        </aside>

        {/* Main */}
        <main className="s-main">
          <div className="dot-grid" style={{ opacity: .05 }}></div>

          {screen === 'waiting' && (
            <div className="s-center">
              <div className="wait-icon">🪐</div>
              <h2>Esperando Jugadores</h2>
              <p className="s-subdesc">
                {letra === '?'
                  ? (esAdmin ? 'Haz clic en la letra de arriba para girar' : 'Esperando que el admin elija una letra...')
                  : <>Letra: <strong style={{ color: 'var(--purple)', fontFamily: 'var(--font-mono)', fontSize: 20 }}>{letra}</strong></>
                }
              </p>
              {letrasUsadas.length > 0 && (
                <p style={{ color: 'var(--text-muted)', fontSize: 11, margin: '4px 0 8px' }}>
                  Letras usadas: {letrasUsadas.join(', ')}
                </p>
              )}
              <p className="s-hint">
                {esAdmin
                  ? 'Eres el administrador — inicia cuando estén listos'
                  : 'Esperando que el admin inicie el juego'}
              </p>
              {esAdmin && (
                <button className="btn lg" onClick={iniciarJuego} disabled={letra === '?' || usuarios.length < 2}>
                  {usuarios.length < 2 ? 'Esperando jugadores...' : '▶ Iniciar Juego'}
                </button>
              )}
            </div>
          )}

          {screen === 'playing' && (
            <div className="s-play">
              <div className="s-play-head">
                <div className="s-play-letter">{letra}</div>
                <div>
                  <h3>Ronda {ronda} — Letra {letra}</h3>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                    Completa todas las categorías
                  </p>
                </div>
              </div>

              <div className="s-entries">
                {categorias.map((cat, i) => {
                  const val = entradas[cat]?.respuesta || '';
                  const startsWrong = val.length > 0 && val[0].toUpperCase() !== letra;
                  return (
                    <div key={cat} className="s-entry" style={{ animationDelay: `${i * .04}s` }}>
                      <label className="s-entry-lbl">{cat}</label>
                      <input
                        className={`input-s ${startsWrong ? 'error' : ''}`}
                        type="text"
                        placeholder={`${cat}...`}
                        value={val}
                        onChange={(e) => handleInputChange(cat, e.target.value)}
                        maxLength={40}
                        autoComplete="off"
                      />
                      {startsWrong && <span className="field-warn">Debe empezar con {letra}</span>}
                    </div>
                  );
                })}
              </div>

              <div style={{ textAlign: 'center', marginTop: 28 }}>
                <button className="btn lg red" onClick={detener}>⏹ DETENER</button>
              </div>
            </div>
          )}

          {screen === 'results' && (
            <div className="s-results">
              <div className="s-res-head">
                <h3>📋 Resultados — Letra {letra}</h3>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {progreso && respuestas.length === 0 && (
                    <span className="badge badge-muted">{progreso.recibidos}/{progreso.total} enviados</span>
                  )}
                  {esAdmin && respuestas.length > 0 && (
                    <button className="btn sm" onClick={activarReiniciar}>🔄 Nueva Ronda</button>
                  )}
                </div>
              </div>

              {respuestas.length === 0 ? (
                <div className="s-center" style={{ minHeight: 200 }}>
                  <p style={{ color: 'var(--text-secondary)' }}>Esperando resultados...</p>
                </div>
              ) : (
                <>
                  <div className="s-table-wrap">
                    <table className="s-table">
                      <thead>
                        <tr>
                          <th style={{ textAlign: 'left' }}>Jugador</th>
                          {categorias.map(c => <th key={c}>{c}</th>)}
                          <th style={{ color: 'var(--yellow)' }}>Pts</th>
                        </tr>
                      </thead>
                      <tbody>
                        {respuestas.map((rpta, ri) => (
                          <tr key={ri}>
                            <td className="td-user">{rpta.usuario}</td>
                            {categorias.map(c => {
                              const cell = rpta[c];
                              const st = !cell?.respuesta ? 'empty' : cell?.correcto === null ? 'pending' : cell?.correcto ? 'correct' : 'wrong';
                              return (
                                <td key={c} style={{ textAlign: 'center' }}>
                                  <span
                                    className={`chip ${st}`}
                                    onClick={() => cell?.id && activarCorreccion(cell.id, c)}
                                  >
                                    {cell?.respuesta || '—'}
                                  </span>
                                </td>
                              );
                            })}
                            <td className="td-pts">{obtenerPuntaje(rpta)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="s-table-hint">Clic en una respuesta para corregir</p>
                </>
              )}
            </div>
          )}
        </main>

        {/* Chat */}
        <aside className="s-chat">
          <div className="s-chat-head"><p className="s-label">💬 Chat</p></div>
          <div className="s-chat-msgs" ref={chatRef}>
            {mensajes.map((m, i) => (
              <div key={i} className={`s-msg ${m.system ? 'sys' : ''} ${m.id === socketRef.current?.id ? 'own' : ''}`}>
                <span className="s-msg-user">{m.nombre}</span>
                <p className="s-msg-text">{m.mensaje}</p>
              </div>
            ))}
          </div>
          <div className="s-chat-input">
            <form onSubmit={(e) => { e.preventDefault(); enviarMensaje(); }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  className="input-s"
                  value={textMsg}
                  onChange={(e) => setTextMsg(e.target.value)}
                  placeholder="Escribe aquí..."
                  maxLength={200}
                  style={{ fontSize: 13 }}
                />
                <button className="btn sm" type="submit" disabled={!textMsg.trim()}>↑</button>
              </div>
            </form>
          </div>
        </aside>
      </div>
    </div>
  );
};