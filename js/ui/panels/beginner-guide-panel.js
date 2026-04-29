const { useState, useEffect, useRef, useMemo, useCallback } = React;

const BeginnerGuidePanel = ({ isOpen, onClose }) => {
  const [stepIndex, setStepIndex] = useState(0);
  const guide = window.BeginnerGuideData || { steps: [], shortcuts: [] };
  const steps = guide.steps || [];
  const shortcuts = guide.shortcuts || [];
  const total = steps.length;
  const current = steps[stepIndex] || { title: 'Guide', body: 'No guide steps configured.' };

  useEffect(() => {
    if (!isOpen) return;
    if (stepIndex >= total && total > 0) setStepIndex(0);
  }, [isOpen, total, stepIndex]);

  if (!isOpen) return null;

  const prevStep = () => {
    if (total <= 0) return;
    setStepIndex((prev) => (prev - 1 + total) % total);
  };

  const nextStep = () => {
    if (total <= 0) return;
    setStepIndex((prev) => (prev + 1) % total);
  };

  return (
    <div className="beginner-guide-panel glass-panel" onPointerDown={(e)=>e.stopPropagation()}>
      <div className="beginner-guide-header">
        <div className="beginner-guide-title">BEGINNER GUIDE</div>
        <button className="beginner-guide-close" onClick={onClose}>HIDE</button>
      </div>

      <div className="beginner-guide-step">
        <div className="beginner-guide-step-meta">STEP {total > 0 ? stepIndex + 1 : 0} / {total}</div>
        <div className="beginner-guide-step-title">{current.title}</div>
        <div className="beginner-guide-step-body">{current.body}</div>
      </div>

      <div className="beginner-guide-nav">
        <button className="beginner-guide-btn" onClick={prevStep}>BACK</button>
        <div className="beginner-guide-dots">
          {steps.map((_, idx) => (
            <div key={idx} className="beginner-guide-dot" style={{ opacity: idx === stepIndex ? 1 : 0.25 }} />
          ))}
        </div>
        <button className="beginner-guide-btn" onClick={nextStep}>NEXT</button>
      </div>

      <div className="beginner-guide-shortcuts">
        <div className="beginner-guide-shortcuts-title">SHORTCUTS & QUICK ACTIONS</div>
        <div className="beginner-guide-shortcuts-list">
          {shortcuts.map((item, idx) => (
            <div key={idx} className="beginner-guide-shortcut-row">
              <div className="beginner-guide-shortcut-key">{item.key}</div>
              <div className="beginner-guide-shortcut-action">{item.action}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
window.BeginnerGuidePanel = BeginnerGuidePanel;
