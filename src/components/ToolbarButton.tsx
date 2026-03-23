interface Props {
  label: string;
  icon: string;   // Path to icon image (e.g. "/icons/skills.png")
  active?: boolean;
  onClick: () => void;
}

export function ToolbarButton({ label, icon, active, onClick }: Props) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={`w-8 h-8 rounded flex items-center justify-center transition-colors ${
        active
          ? 'bg-blue-600'
          : 'bg-gray-800 hover:bg-gray-700'
      }`}
    >
      <img src={icon} alt={label} className="w-5 h-5" />
    </button>
  );
}
