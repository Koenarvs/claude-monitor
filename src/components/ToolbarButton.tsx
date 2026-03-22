interface Props {
  label: string;
  icon: string;   // Single emoji or character
  active?: boolean;
  onClick: () => void;
}

export function ToolbarButton({ label, icon, active, onClick }: Props) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={`w-8 h-8 rounded flex items-center justify-center text-sm transition-colors ${
        active
          ? 'bg-blue-600 text-white'
          : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200'
      }`}
    >
      {icon}
    </button>
  );
}
