const LobbyScreen = ({ onStart, savedProjects = [], onLoadProject }) => {
    const [activeTab, setActiveTab] = React.useState('SOLO');
    const [joinId, setJoinId] = React.useState('');
    const [status, setStatus] = React.useState('SYSTEM_READY');
    const [isConnecting, setIsConnecting] = React.useState(false);
    const [localServers, setLocalServers] = React.useState([]);
    const [nickname, setNickname] = React.useState(window.OptoNetwork.username);
    const [bootPhase, setBootPhase] = React.useState(0);
    const [isSidebarOpen, setIsSidebarOpen] = React.useState(false);

    React.useEffect(() => {
        const timer = setInterval(() => {
            setBootPhase(prev => {
                if (prev >= 3) { clearInterval(timer); return 3; }
                return prev + 1;
            });
        }, 400);

        const checkLocal = () => {
            try {
                const id = localStorage.getItem('optorack_local_host_id');
                const name = localStorage.getItem('optorack_local_host_name');
                const time = localStorage.getItem('optorack_local_host_time');
                if (id && Date.now() - parseInt(time) < 10000) {
                    setLocalServers([{ id, name, type: 'LAN_NODE', ping: '<1ms' }]);
                } else {
                    setLocalServers([]);
                }
            } catch (e) { }
        };
        checkLocal();
        const interval = setInterval(checkLocal, 3000);
        return () => { clearInterval(timer); clearInterval(interval); };
    }, []);

    const handleJoin = async (targetId) => {
        const idToJoin = (targetId || joinId).trim().toUpperCase();
        if (!idToJoin) return;
        setStatus('ESTABLISHING_UPLINK...');
        setIsConnecting(true);
        window.OptoNetwork.onConnected = () => {
            setStatus('HANDSHAKE_COMPLETE');
            setTimeout(() => onStart('GUEST'), 500);
        };
        try {
            await window.OptoNetwork.initGuest(idToJoin);
        } catch (err) {
            setStatus(`UPLINK_ERROR: ${err.message}`);
            setIsConnecting(false);
        }
    };

    const handleHost = async () => {
        setStatus('INITIALIZING_HOST_NODE...');
        setIsConnecting(true);
        try {
            await window.OptoNetwork.initHost();
            setStatus('NODE_ONLINE');
            setTimeout(() => onStart('HOST'), 800);
        } catch (e) {
            setStatus('HOST_INIT_FAILED');
            setIsConnecting(false);
        }
    };

    const tabs = [
        { id: 'SOLO', label: 'SOLO', icon: '👤' },
        { id: 'PROJECTS', label: 'PROJECTS', icon: '📁' },
        { id: 'LAN', label: 'LOCAL', icon: '🏠' },
        { id: 'COMMUNITY', label: 'NETWORK', icon: '🌐' },
        { id: 'PROFILE', label: 'PROFILE', icon: '⚙️' }
    ];

    return (
        <div className="opto-lobby-root">
            <div className="cyber-grid" />
            <div className="vignette" />
            <div className="scanline" />

            <div className="lobby-top-bar" style={{ opacity: bootPhase >= 1 ? 1 : 0 }}>
                <div className="mobile-menu-btn" onPointerDown={(e) => { e.stopPropagation(); setIsSidebarOpen(!isSidebarOpen); }}>☰</div>
                <div className="system-tag">OPTORACK // NODE_ACTIVE</div>
                <div className="status-readout">
                    <span className="dot" />
                    <span className="desktop-only">SIGNAL: 98%</span>
                </div>
            </div>

            <div className={`lobby-main-layout ${isSidebarOpen ? 'sidebar-open' : ''}`} style={{ opacity: bootPhase >= 2 ? 1 : 0, transform: `translateY(${bootPhase >= 2 ? '0' : '20px'})` }}>

                <div className="lobby-sidebar glass-panel">
                    <div className="lobby-logo">
                        OPTO<span className="cyan">RACK</span>
                        <div className="logo-sub">STUDIO_SYSTEM</div>
                    </div>
                    <div className="nav-group">
                        {tabs.map(tab => (
                            <button
                                key={tab.id}
                                className={`nav-item ${activeTab === tab.id ? 'active' : ''}`}
                                onPointerDown={(e) => { e.stopPropagation(); setActiveTab(tab.id); setIsSidebarOpen(false); }}
                            >
                                <span className="icon">{tab.icon}</span>
                                <span className="label">{tab.label}</span>
                                {activeTab === tab.id && <div className="active-indicator" />}
                            </button>
                        ))}
                    </div>
                    <div className="sidebar-footer">
                        <div className="nickname-display">
                            <label>ID_TAG</label>
                            <div className="name">{nickname}</div>
                        </div>
                    </div>
                </div>

                <div className="lobby-content glass-panel">

                    {activeTab === 'SOLO' && (
                        <div className="tab-pane">
                            <h2 className="pane-title">STUDIO_OFFLINE</h2>
                            <p className="pane-desc">Launch a private OptoRack instance for high-fidelity spectrogram synthesis without network latency.</p>
                            <div className="hero-action">
                                <button className="primary-glow-btn" onPointerDown={(e) => { e.stopPropagation(); onStart('OFFLINE'); }}>
                                    LAUNCH_LOCAL
                                </button>
                            </div>
                        </div>
                    )}

                    {activeTab === 'PROJECTS' && (
                        <div className="tab-pane">
                            <h2 className="pane-title">SAVED_PROJECTS</h2>
                            <p className="pane-desc">Reopen your existing workspaces. Mount directory in studio to populate.</p>
                            <div className="project-grid">
                                {savedProjects.length > 0 ? savedProjects.map((p, idx) => (
                                    <div key={idx} className="project-card glass-panel" onPointerDown={(e) => { e.stopPropagation(); onLoadProject(p.handle); }}>
                                        <div className="card-icon">📁</div>
                                        <div className="card-info">
                                            <div className="card-name">{p.name.replace('.json', '').toUpperCase()}</div>
                                            <div className="card-meta">FILE_READY</div>
                                        </div>
                                        <button className="card-load-btn">LOAD</button>
                                    </div>
                                )) : (
                                    <div className="empty-state">
                                        NO_PROJECTS_DETECTED<br />
                                        <span style={{ fontSize: '9px', opacity: 0.5 }}>ACCESS VIA STUDIO FIRST</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {activeTab === 'LAN' && (
                        <div className="tab-pane">
                            <h2 className="pane-title">LOCAL_NODES</h2>
                            <p className="pane-desc">Discovery of studios on your local machine or network.</p>
                            <div className="server-list">
                                {localServers.length > 0 ? localServers.map(s => (
                                    <div key={s.id} className="server-card glass-panel" onPointerDown={(e) => { e.stopPropagation(); handleJoin(s.id); }}>
                                        <div className="card-header">
                                            <span className="server-name">{s.name.toUpperCase()}'S_LOBBY</span>
                                            <span className="tag cyan">LAN</span>
                                        </div>
                                        <button className="card-join-btn">ESTABLISH_LINK</button>
                                    </div>
                                )) : (
                                    <div className="empty-state">NO_LOCAL_NODES_FOUND</div>
                                )}
                            </div>
                        </div>
                    )}

                    {activeTab === 'COMMUNITY' && (
                        <div className="tab-pane">
                            <h2 className="pane-title">NETWORK_UPLINK</h2>
                            <p className="pane-desc">Connect via Lobby ID or initialize a new Host Node.</p>
                            <div className="direct-join-area glass-panel">
                                <label>TARGET_LOBBY_ID</label>
                                <div className="join-row">
                                    <input
                                        type="text"
                                        value={joinId}
                                        onChange={e => setJoinId(e.target.value)}
                                        placeholder="OPTO-XXXXXX"
                                        className="cyber-input"
                                    />
                                    <button className="join-submit" onPointerDown={(e) => { e.stopPropagation(); handleJoin(joinId); }} disabled={isConnecting}>
                                        JOIN
                                    </button>
                                </div>
                            </div>
                            <div className="divider-text">OR</div>
                            <button className="host-btn" onPointerDown={(e) => { e.stopPropagation(); handleHost(); }} disabled={isConnecting}>
                                CREATE_NEW_HOST_NODE
                            </button>
                        </div>
                    )}

                    {activeTab === 'PROFILE' && (
                        <div className="tab-pane">
                            <h2 className="pane-title">USER_IDENTITY</h2>
                            <p className="pane-desc">Manage your network signature and peer status.</p>
                            <div className="profile-edit glass-panel">
                                <div className="input-group">
                                    <label>NICKNAME</label>
                                    <input
                                        type="text"
                                        value={nickname}
                                        onChange={e => { setNickname(e.target.value); window.OptoNetwork.setUsername(e.target.value); }}
                                        className="cyber-input"
                                    />
                                </div>
                                <div className="profile-stats">
                                    <div className="stat-box">
                                        <label>PEER_ID</label>
                                        <div className="val">{window.OptoNetwork.peer?.id || '---'}</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="lobby-status-bar">
                        <span className="label">STATUS:</span>
                        <span className="value">{status}</span>
                    </div>
                </div>
            </div>

            <style dangerouslySetInnerHTML={{
                __html: `
                .opto-lobby-root {
                    width: 100%; height: 100%; background: #07070A; color: #fff;
                    display: flex; align-items: center; justify-content: center;
                    font-family: 'Open Sans', sans-serif; position: relative; overflow: hidden;
                    -webkit-font-smoothing: antialiased; touch-action: none;
                }
                .cyber-grid {
                    position: absolute; width: 200%; height: 200%; top: -50%; left: -50%;
                    background-image: linear-gradient(rgba(0, 229, 255, 0.08) 1px, transparent 1px),
                                      linear-gradient(90deg, rgba(0, 229, 255, 0.08) 1px, transparent 1px);
                    background-size: 60px 60px; transform: perspective(600px) rotateX(60deg);
                    animation: grid-move 15s linear infinite;
                }
                @keyframes grid-move { from { transform: perspective(600px) rotateX(60deg) translateY(0); } to { transform: perspective(600px) rotateX(60deg) translateY(60px); } }
                .vignette { position: absolute; inset: 0; background: radial-gradient(circle, transparent 20%, #07070A 100%); pointer-events: none; }
                .scanline { position: absolute; width: 100%; height: 120px; background: linear-gradient(0deg, transparent, rgba(0, 229, 255, 0.04), transparent); top: -120px; animation: scanline-move 6s linear infinite; pointer-events: none; }
                @keyframes scanline-move { from { top: -120px; } to { top: 100vh; } }

                .lobby-top-bar { 
                    position: absolute; top: 0; left: 0; width: 100%; height: 50px; 
                    display: flex; align-items: center; justify-content: space-between; 
                    padding: 0 20px; border-bottom: 2px solid rgba(0, 229, 255, 0.15); 
                    background: rgba(0,0,0,0.8); z-index: 1000; transition: opacity 0.5s; 
                    backdrop-filter: blur(10px);
                }
                .mobile-menu-btn { display: none; font-size: 24px; cursor: pointer; color: #00E5FF; }
                .system-tag { font-size: 11px; color: #888; letter-spacing: 2.5px; font-weight: bold; }
                .status-readout { font-size: 11px; color: #00FF00; display: flex; align-items: center; gap: 10px; font-weight: bold; }
                .status-readout .dot { width: 5px; height: 5px; background: #00FF00; border-radius: 50%; box-shadow: 0 0 8px #00FF00; }

                .lobby-main-layout { 
                    width: 95%; max-width: 1000px; height: 80vh; max-height: 700px; 
                    display: flex; gap: 20px; z-index: 10; transition: all 0.8s cubic-bezier(0.16, 1, 0.3, 1); 
                }
                
                .lobby-sidebar { 
                    width: 250px; display: flex; flex-direction: column; padding: 30px 0; 
                    border: 1px solid rgba(0, 229, 255, 0.25); border-radius: 16px; 
                    box-shadow: 0 10px 40px rgba(0,0,0,0.5); transition: transform 0.3s ease;
                }
                .lobby-logo { font-size: 1.6rem; font-weight: 900; text-align: center; margin-bottom: 40px; letter-spacing: -1.5px; line-height: 1; }
                .logo-sub { font-size: 0.55rem; color: #444; letter-spacing: 3px; margin-top: 4px; font-weight: 900; text-transform: uppercase; }
                .cyan { color: #00E5FF; text-shadow: 0 0 20px rgba(0, 229, 255, 0.6); }
                
                .nav-group { flex: 1; display: flex; flex-direction: column; gap: 5px; padding: 0 10px; }
                .nav-item { 
                    background: transparent; border: none; color: #666; padding: 12px 20px; 
                    text-align: left; cursor: pointer; display: flex; align-items: center; 
                    gap: 15px; font-size: 0.9rem; font-weight: bold; position: relative; 
                    transition: all 0.2s; border-radius: 8px; 
                }
                .nav-item.active { color: #00E5FF; background: rgba(0, 229, 255, 0.12); }
                .nav-item:hover:not(.active) { color: #fff; background: rgba(255,255,255,0.05); }
                .nav-item .active-indicator { position: absolute; left: 0; width: 4px; height: 60%; top: 20%; background: #00E5FF; border-radius: 0 4px 4px 0; box-shadow: 0 0 15px #00E5FF; }

                .sidebar-footer { padding: 20px; border-top: 1px solid rgba(255,255,255,0.06); }
                .nickname-display label { font-size: 8px; color: #555; display: block; margin-bottom: 4px; font-weight: bold; }
                .nickname-display .name { font-size: 0.85rem; color: #fff; font-weight: 900; overflow: hidden; text-overflow: ellipsis; }

                .lobby-content { 
                    flex: 1; border: 1px solid rgba(0, 229, 255, 0.25); border-radius: 16px; 
                    padding: 40px; display: flex; flex-direction: column; position: relative; 
                    box-shadow: 0 10px 40px rgba(0,0,0,0.5); overflow-y: auto;
                }
                .pane-title { margin: 0 0 10px 0; font-size: 1.8rem; font-weight: 900; letter-spacing: 2px; color: #fff; }
                .pane-desc { font-size: 0.8rem; color: #999; line-height: 1.6; margin-bottom: 30px; max-width: 450px; font-weight: 500; }
                
                .hero-action { flex: 1; align-items: center; justify-content: center; }
                .primary-glow-btn { 
                    background: #00E5FF; color: #000; border: none; padding: 20px 45px; 
                    font-size: 1rem; font-weight: 900; border-radius: 6px; cursor: pointer; 
                    transition: all 0.3s; box-shadow: 0 0 30px rgba(0, 229, 255, 0.4); 
                    text-transform: uppercase; 
                }
                .primary-glow-btn:hover { background: #fff; box-shadow: 0 0 50px rgba(255,255,255,0.5); transform: translateY(-3px); }
                
                .project-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 15px; }
                .project-card { 
                    padding: 15px; border: 1px solid rgba(255,255,255,0.1); 
                    display: flex; align-items: center; gap: 15px; cursor: pointer; 
                    transition: all 0.2s ease; border-radius: 10px; 
                }
                .project-card:hover { border-color: #00E5FF; background: rgba(0, 229, 255, 0.1); }
                .card-icon { font-size: 1.2rem; }
                .card-info { flex: 1; overflow: hidden; }
                .card-name { font-size: 0.8rem; font-weight: 900; color: #fff; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
                .card-meta { font-size: 7px; color: #00FF00; font-weight: 900; }
                .card-load-btn { background: transparent; border: 1px solid rgba(255,255,255,0.2); color: #fff; padding: 4px 10px; border-radius: 4px; font-size: 8px; font-weight: 900; }

                .direct-join-area { padding: 25px; border: 1px solid rgba(255,255,255,0.1); margin-bottom: 25px; border-radius: 12px; }
                .join-row { display: flex; gap: 10px; }
                .cyber-input { flex: 1; background: rgba(0,0,0,0.5); border: 1px solid rgba(0, 229, 255, 0.3); padding: 12px 15px; color: #00E5FF; font-family: inherit; font-size: 1rem; outline: none; border-radius: 6px; font-weight: bold; }
                .join-submit { background: #1A1A1E; color: #fff; border: 1px solid #333; padding: 0 25px; cursor: pointer; border-radius: 6px; font-weight: 900; }

                .host-btn { width: 100%; padding: 15px; background: transparent; border: 2px dashed rgba(255, 0, 170, 0.2); color: #888; cursor: pointer; border-radius: 8px; font-weight: 900; transition: all 0.2s; }
                .host-btn:hover { border-color: #FF00AA; color: #FF00AA; transform: translateY(-2px); }

                .server-card { padding: 20px; border: 1px solid rgba(255,255,255,0.1); cursor: pointer; border-radius: 12px; display: flex; justify-content: space-between; align-items: center; }
                .server-card:hover { border-color: #00E5FF; transform: scale(1.01); }

                .lobby-status-bar { margin-top: auto; padding-top: 20px; border-top: 1px solid rgba(255,255,255,0.06); font-size: 9px; display: flex; gap: 10px; font-weight: 900; }
                .lobby-status-bar .value { color: #00E5FF; text-shadow: 0 0 10px rgba(0, 229, 255, 0.4); }
                
                .glass-panel { background: rgba(10, 10, 15, 0.7); backdrop-filter: blur(25px); -webkit-backdrop-filter: blur(25px); }
                .empty-state { padding: 40px; text-align: center; color: #444; font-size: 0.8rem; border: 2px dashed rgba(255,255,255,0.03); border-radius: 16px; font-weight: 900; }

                @media (max-width: 800px) {
                    .lobby-main-layout { flex-direction: column; height: 95vh; max-height: none; width: 100%; margin-top: 50px; gap: 0; }
                    .lobby-sidebar { 
                        position: fixed; left: -100%; top: 50px; width: 260px; height: calc(100vh - 50px); 
                        z-index: 2000; border-radius: 0; border-left: none; border-top: none;
                        transition: left 0.3s cubic-bezier(0.16, 1, 0.3, 1);
                        padding: 20px 0;
                    }
                    .sidebar-open .lobby-sidebar { left: 0; box-shadow: 20px 0 50px rgba(0,0,0,0.8); }
                    .mobile-menu-btn { display: block; padding: 0 10px; }
                    .lobby-content { width: 100%; height: 100%; border-radius: 0; border: none; padding: 25px; }
                    .pane-title { font-size: 1.4rem; }
                    .pane-desc { font-size: 0.75rem; margin-bottom: 20px; }
                    .desktop-only { display: none; }
                    .project-grid { grid-template-columns: 1fr; }
                    .lobby-logo { margin-bottom: 25px; scale: 0.9; }
                }

                @media (max-height: 500px) and (max-width: 900px) {
                    .lobby-sidebar { padding: 10px 0; overflow-y: auto; }
                    .lobby-logo { margin-bottom: 10px; scale: 0.7; }
                    .nav-item { padding: 8px 20px; font-size: 0.8rem; }
                    .pane-title { font-size: 1.1rem; margin-bottom: 5px; }
                    .pane-desc { font-size: 0.7rem; margin-bottom: 15px; }
                }
            `}} />
        </div>
    );
};
window.LobbyScreen = LobbyScreen;
