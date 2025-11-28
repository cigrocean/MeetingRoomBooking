import React, { useEffect } from "react";
import { CheckCircle, XCircle, X } from "lucide-react";

const Toast = ({ type, message, onClose, duration = 5000 }) => {
  const isSuccess = type === "success";
  const Icon = isSuccess ? CheckCircle : XCircle;
  const borderColor = isSuccess ? "border-success" : "border-danger";
  const iconColor = isSuccess ? "text-success" : "text-danger";

  // Auto-dismiss after duration
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose]);

  return (
    <div className="fixed top-4 right-4 z-[70] animate-in fade-in slide-in-from-top duration-300">
      <div
        className={`bg-surface ${borderColor} border-2 rounded-lg shadow-lg p-4 min-w-[300px] max-w-md flex items-start gap-3`}
      >
        <Icon className={`${iconColor} flex-shrink-0 mt-0.5`} size={20} />
        <p className="text-white text-sm flex-1">{message}</p>
        <button
          onClick={onClose}
          className="text-white/70 hover:text-white transition-colors flex-shrink-0"
          title="Dismiss"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
};

export default Toast;

