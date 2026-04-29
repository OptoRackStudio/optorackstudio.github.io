// ERROR BOUNDARY & UTILS
// ═══════════════════════════════════════════════════════════════════════════

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }
    static getDerivedStateFromError(error) { return { hasError: true }; }
    componentDidCatch(error, errorInfo) { this.setState({ error, errorInfo }); }
    render() {
        if (this.state.hasError) {
            return (
                <div className="error-boundary">
                    <h2 className="error-title">🚨 SYSTEM CRASH 🚨</h2>
                    <p className="error-text">React encountered a fatal runtime error.</p>
                    <div className="error-box">
                        <div className="error-msg">{this.state.error && this.state.error.toString()}</div>
                        <pre className="error-pre">
                            {this.state.errorInfo && this.state.errorInfo.componentStack}
                        </pre>
                    </div>
                </div>
            );
        }
        return this.props.children; 
    }
}

const PerformanceMeter = () => {
    const fpsRef = React.useRef(null); const msRef = React.useRef(null);
    const frames = React.useRef(0); const prevTime = React.useRef(performance.now());
    React.useEffect(() => {
        let id;
        const loop = () => {
            frames.current++; const time = performance.now();
            if (time >= prevTime.current + 1000) {
                if(fpsRef.current) fpsRef.current.innerText = Math.min(120, Math.round((frames.current * 1000) / (time - prevTime.current)));
                if(msRef.current) msRef.current.innerText = ((time - prevTime.current) / frames.current).toFixed(1);
                frames.current = 0; prevTime.current = time;
            }
            id = requestAnimationFrame(loop);
        };
        loop(); return () => cancelAnimationFrame(id);
    }, []);
    return (
        <div className="perf-meter glass-panel" style={{display:'flex', gap:'8px', alignItems:'center'}}>
            <span>FPS: <span ref={fpsRef} style={{color:'#FFF'}}>60</span></span>
            <span style={{color:'#555', margin: '0 2px'}}>|</span>
            <span>MS: <span ref={msRef} style={{color:'#FFF'}}>16.6</span></span>
        </div>
    );
};

const CPUGraph = () => {
    const canvasRef = React.useRef(null);
    React.useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        const history = new Array(60).fill(0);
        let lastTime = performance.now();
        let animationId;
        
        const draw = () => {
            const now = performance.now();
            const delta = now - lastTime;
            lastTime = now;
            
            // Calculate load based on 60FPS target
            const load = Math.min((delta / 16.66) * 100, 100);
            history.shift();
            history.push(load);
            
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.beginPath();
            ctx.moveTo(0, canvas.height);
            
            for (let i = 0; i < history.length; i++) {
                const x = (i / history.length) * canvas.width;
                const y = canvas.height - (history[i] / 100) * canvas.height;
                ctx.lineTo(x, y);
            }
            
            const currentLoad = history[history.length - 1];
            ctx.strokeStyle = currentLoad > 85 ? '#ff4444' : (currentLoad > 50 ? '#ffbb33' : '#00C851');
            ctx.lineWidth = 2;
            ctx.stroke();
            
            animationId = requestAnimationFrame(draw);
        };
        draw();
        return () => cancelAnimationFrame(animationId);
    }, []);
    
    return (
        <div className="perf-meter glass-panel" style={{display:'flex', gap:'8px', alignItems:'center'}}>
            <span>DSP LOAD</span>
            <canvas ref={canvasRef} width={60} height={16} style={{width:'60px', height:'16px', backgroundColor:'rgba(0,0,0,0.5)', borderRadius:'2px'}} />
        </div>
    );
};
window.PerformanceMeter = PerformanceMeter;
window.CPUGraph = CPUGraph;
window.ErrorBoundary = ErrorBoundary;