const TipsPanel = ({ assignMode, tipIndex }) => {
  const tips = (window.AppTips && window.AppTips.items) || [];
  const safeTip = tips.length > 0 ? tips[tipIndex % tips.length] : '';

  return (
    <div className="pro-tip">
      {assignMode ? "CLICK A KNOB TO ASSIGN MACRO" : safeTip}
    </div>
  );
};
window.TipsPanel = TipsPanel;
