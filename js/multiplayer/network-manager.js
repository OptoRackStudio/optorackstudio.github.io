class NetworkManager {
    constructor() {
        this.peer = null;
        this.isHost = false;
        this.lobbyId = null;
        this.username = localStorage.getItem('opto_username') || `User_${Math.floor(Math.random() * 1000)}`;
        
        // Host state
        this.connections = []; 
        this.mediaCalls = []; 
        this.cachedMediaStream = null; 
        this.connectedPlayers = new Map(); // peerId -> username
        
        // Guest state
        this.conn = null;
        this.mediaCall = null;
        this.remoteStream = null; // Cache for guest
        this.latency = 0;
        this.lastHeartbeat = Date.now();
        
        // Anti-troll / Permissions
        this.permissions = {
            canPatch: true,
            canTweak: true
        };
        
        // Callbacks
        this.onConnected = () => {};
        this.onData = (data) => {};
        this.onStream = (stream) => {};
        this.onError = (err) => {};
        this.onPeerDisconnected = (peerId) => {};
        this.onPlayerListUpdated = (players) => {};
        this.onPermissionsChanged = (perms) => {};
    }

    setUsername(name) {
        this.username = name;
        localStorage.setItem('opto_username', name);
    }

    initHost() {
        return new Promise((resolve, reject) => {
            console.log('%c[OptoNetwork] Initializing Host...', 'color: #00E5FF; font-weight: bold;');
            this.isHost = true;
            this.connections = [];
            this.mediaCalls = [];
            this.connectedPlayers.clear();
            this.connectedPlayers.set('HOST', this.username);
            
            const charset = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
            let randomId = 'OPTO-';
            for (let i = 0; i < 6; i++) randomId += charset.charAt(Math.floor(Math.random() * charset.length));
            
            this.peer = new Peer(randomId, {
                config: {
                    'iceServers': [
                        { url: 'stun:stun.l.google.com:19302' },
                        { url: 'stun:stun1.l.google.com:19302' },
                        { url: 'stun:stun2.l.google.com:19302' },
                    ]
                }
            });

            this._sigHeartbeat = setInterval(() => {
                if (this.peer && this.peer.disconnected && !this.peer.destroyed) {
                    this.peer.reconnect();
                }
            }, 10000);

            this.peer.on('open', (id) => {
                this.lobbyId = id;
                console.log('%c[OptoNetwork] Host Lobby Created: ' + id, 'color: #00FF00;');

                const publishLocal = () => {
                    try {
                        localStorage.setItem('optorack_local_host_id', id);
                        localStorage.setItem('optorack_local_host_name', this.username);
                        localStorage.setItem('optorack_local_host_time', Date.now());
                    } catch(e) {}
                };
                
                publishLocal();
                this.localHeartbeat = setInterval(publishLocal, 3000);

                this._cleanupHandler = () => {
                    try { localStorage.removeItem('optorack_local_host_id'); } catch(e){}
                };
                window.addEventListener('beforeunload', this._cleanupHandler);

                this.onPlayerListUpdated(this.getPlayersList());
                resolve(id);
            });

            this.peer.on('connection', (conn) => {
                console.log('%c[OptoNetwork] Incoming connection from: ' + conn.peer, 'color: #FFCC00;');
                if (this.connections.length >= 4) {
                    conn.on('open', () => {
                        conn.send({ type: 'ERROR', message: 'LOBBY_FULL' });
                        setTimeout(() => conn.close(), 500);
                    });
                    return;
                }
                this.connections.push(conn);
                this.setupHostConnection(conn);
            });

            this.peer.on('call', (call) => {
                call.answer(); 
            });

            this.peer.on('error', (err) => {
                console.error('[OptoNetwork] Host Peer Error:', err.type, err);
                this.onError(err);
                reject(err);
            });
            
            this.peer.on('disconnected', () => {
                this.peer.reconnect();
            });
        });
    }

    initGuest(lobbyId) {
        return new Promise((resolve, reject) => {
            const cleanId = lobbyId.trim().toUpperCase();
            this.isHost = false;

            const setupPeer = () => {
                this.peer = new Peer({
                    config: {
                        'iceServers': [
                            { url: 'stun:stun.l.google.com:19302' },
                            { url: 'stun:stun1.l.google.com:19302' },
                            { url: 'stun:stun2.l.google.com:19302' },
                        ]
                    }
                });

                this.peer.on('open', (id) => {
                    console.log('[OptoNetwork] Guest Peer ID: ' + id);
                    if (id === cleanId) {
                        reject(new Error("Cannot join your own Lobby ID."));
                        return;
                    }
                    startConnection();
                });

                this.peer.on('error', (err) => {
                    console.error('[OptoNetwork] Guest Peer Error:', err.type);
                    reject(new Error(`Signaling Error: ${err.type}`));
                });

                this.peer.on('call', (call) => {
                    this.mediaCall = call;
                    call.answer(); 
                    call.on('stream', (remoteStream) => {
                        this.remoteStream = remoteStream;
                        if (this.onStream) this.onStream(remoteStream);
                    });
                });
            };

            const startConnection = () => {
                let retries = 0;
                const maxRetries = 2;

                const attemptConnection = () => {
                    console.log(`[OptoNetwork] Connecting to ${cleanId}... (Attempt ${retries + 1}/${maxRetries + 1})`);
                    // Use default PeerJS serialization (binary) for performance and ease
                    this.conn = this.peer.connect(cleanId, { 
                        reliable: true // Handshake should be reliable
                    });
                    
                    const timeout = setTimeout(() => {
                        if (!this.conn.open) {
                            console.warn('[OptoNetwork] Handshake timeout. Closing...');
                            this.conn.close();
                            handleFail();
                        }
                    }, 5000);

                    const handleFail = () => {
                        if (retries < maxRetries) {
                            retries++;
                            setTimeout(attemptConnection, 1000);
                        } else {
                            reject(new Error("Host not found. Check Lobby ID."));
                        }
                    };

                    this.conn.on('open', () => {
                        clearTimeout(timeout);
                        console.log('%c[OptoNetwork] Data Channel Open. Completing Handshake...', 'color: #00FF00;');
                        this.setupGuestConnection();
                        resolve();
                    });

                    this.conn.on('error', (err) => {
                        clearTimeout(timeout);
                        handleFail();
                    });
                };
                attemptConnection();
            };

            if (!this.peer || this.peer.destroyed) setupPeer();
            else if (this.peer.disconnected) {
                this.peer.reconnect();
                this.peer.on('open', startConnection);
            } else startConnection();
        });
    }

    setupHostConnection(conn) {
        conn.on('data', (data) => {
            // Data is already an object thanks to PeerJS default serialization
            const msg = data;
            if (!msg || typeof msg !== 'object') return;

            if (msg.type === 'JOIN') {
                this.connectedPlayers.set(conn.peer, msg.username);
                this.onPlayerListUpdated(this.getPlayersList());
                this.sendToSpecific(conn, { type: 'PLAYER_LIST', players: this.getPlayersList() });
                this.broadcast({ type: 'PLAYER_LIST', players: this.getPlayersList() }, conn.peer);
                if (this.cachedMediaStream) {
                    const call = this.peer.call(conn.peer, this.cachedMediaStream);
                    this.mediaCalls.push(call);
                }
                this.onConnected(conn.peer);
                return;
            }

            if (msg.type === 'HEARTBEAT') {
                this.sendToSpecific(conn, { type: 'PONG', time: msg.time });
                return;
            }

            // ANTI-TROLLING ENFORCEMENT
            if (msg.type === 'MODULE_MOVE' && !this.permissions.canPatch) {
                console.warn('[OptoNetwork] Blocked unauthorized MODULE_MOVE from guest');
                return;
            }
            if (msg.type === 'PARAM_UPDATE' && !this.permissions.canTweak) {
                console.warn('[OptoNetwork] Blocked unauthorized PARAM_UPDATE from guest');
                return;
            }

            // Relay message to App and other peers
            this.onData(msg);
            this.broadcast(msg, conn.peer);
        });

        conn.on('close', () => {
            this.connections = this.connections.filter(c => c.peer !== conn.peer);
            this.connectedPlayers.delete(conn.peer);
            this.onPlayerListUpdated(this.getPlayersList());
            this.onPeerDisconnected(conn.peer);
            this.broadcast({ type: 'PLAYER_LIST', players: this.getPlayersList() });
        });
    }

    setupGuestConnection() {
        this.conn.on('data', (data) => {
            const msg = data;
            if (!msg || typeof msg !== 'object') return;

            if (msg.type === 'PLAYER_LIST') this.onPlayerListUpdated(msg.players);
            else if (msg.type === 'PERMISSIONS') {
                this.permissions = msg.permissions;
                this.onPermissionsChanged(this.permissions);
            } else if (msg.type === 'ERROR') {
                if (msg.message === 'LOBBY_FULL') alert('Lobby is full.');
                if (msg.message === 'KICKED_BY_HOST') {
                    alert('You have been kicked by the host.');
                    window.location.reload();
                }
            } else if (msg.type === 'PONG') {
                this.latency = Date.now() - msg.time;
                this.lastHeartbeat = Date.now();
            } else {
                this.onData(msg);
            }
        });

        this.heartbeatInterval = setInterval(() => {
            if (this.conn && this.conn.open) this.send({ type: 'HEARTBEAT', time: Date.now() });
            else clearInterval(this.heartbeatInterval);
        }, 3000);

        this.conn.on('close', () => this.onPeerDisconnected('HOST'));
        
        // Initial Join Handshake
        this.send({ type: 'JOIN', username: this.username });
        this.onConnected('HOST');
    }

    send(data) {
        if (this.isHost) this.broadcast(data);
        else if (this.conn && this.conn.open) this.conn.send(data);
    }

    broadcast(data, excludeId = null) {
        if (!this.isHost) return;
        this.connections.forEach(conn => {
            if (conn.open && conn.peer !== excludeId) conn.send(data);
        });
    }
    
    sendToSpecific(conn, data) {
        if (conn && conn.open) conn.send(data);
    }

    streamMedia(mediaStream) {
        if (!this.isHost) return;
        this.cachedMediaStream = mediaStream;
        this.connections.forEach(conn => {
            if (conn.open) {
                const call = this.peer.call(conn.peer, mediaStream);
                this.mediaCalls.push(call);
            }
        });
    }

    setPermissions(perms) {
        if (!this.isHost) return;
        this.permissions = { ...this.permissions, ...perms };
        this.broadcast({ type: 'PERMISSIONS', permissions: this.permissions });
    }

    kickPlayer(peerId) {
        if (!this.isHost) return;
        const conn = this.connections.find(c => c.peer === peerId);
        if (conn) {
            conn.send({ type: 'ERROR', message: 'KICKED_BY_HOST' });
            setTimeout(() => conn.close(), 500);
            this.connectedPlayers.delete(peerId);
            this.onPlayerListUpdated(this.getPlayersList());
        }
    }

    getPlayersList() {
        return Array.from(this.connectedPlayers.values());
    }

    disconnect() {
        if (this.isHost) {
            try { 
                localStorage.removeItem('optorack_local_host_id'); 
                if (this.localHeartbeat) clearInterval(this.localHeartbeat);
                if (this._sigHeartbeat) clearInterval(this._sigHeartbeat);
                if (this._cleanupHandler) window.removeEventListener('beforeunload', this._cleanupHandler);
            } catch(e){}
            this.connections.forEach(c => c.close());
            this.mediaCalls.forEach(c => c.close());
            this.connections = [];
            this.mediaCalls = [];
        } else {
            if (this.conn) this.conn.close();
            if (this.mediaCall) this.mediaCall.close();
        }
        if (this.peer) this.peer.destroy();
        this.connectedPlayers.clear();
        this.onPlayerListUpdated([]);
    }
}

window.OptoNetwork = new NetworkManager();
