import React from "react";
import { CheckCircle, XCircle } from "lucide-react";
import { useLanguage } from "../hooks/useLanguage";
import { getTranslation } from "../utils/translations";

const AlertDialog = ({ type, title, message, link, onClose }) => {
  const { language } = useLanguage();
  const t = (key, params) => getTranslation(key, language, params);
  const isSuccess = type === "success";
  const Icon = isSuccess ? CheckCircle : XCircle;
  const textColor = isSuccess ? "text-success" : "text-danger";
  const iconColor = isSuccess ? "text-success" : "text-danger";

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-2 sm:p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-surface w-full max-w-md rounded-lg shadow-lg border border-slate-700 animate-in fade-in zoom-in duration-200">
        <div
          className="flex justify-between items-center border-b border-slate-700"
          style={{
            paddingLeft: "1rem",
            paddingRight: "1rem",
            paddingTop: "1rem",
            paddingBottom: "1rem",
          }}
        >
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <Icon className={`${iconColor} flex-shrink-0`} size={24} />
            <h2 className="text-lg sm:text-xl font-bold text-white truncate">
              {title}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 min-w-[40px] min-h-[40px] p-0 rounded-full bg-surface-hover hover:bg-danger/20 transition-all border border-slate-700 hover:border-danger flex items-center justify-center flex-shrink-0"
            title={t('close')}
          >
            <img
              src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IndoaXRlIiBzdHJva2Utd2lkdGg9IjIuNSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48bGluZSB4MT0iMTgiIHkxPSI2IiB4Mj0iNiIgeTI9IjE4Ij48L2xpbmU+PGxpbmUgeDE9IjYiIHkxPSI2IiB4Mj0iMTgiIHkyPSIxOCI+PC9saW5lPjwvc3ZnPg=="
              alt="Close"
              className="w-5 h-5 block"
            />
          </button>
        </div>

        <div
          className="flex flex-col gap-3 sm:gap-4"
          style={{
            paddingLeft: "1rem",
            paddingRight: "1rem",
            paddingTop: "1rem",
            paddingBottom: "1rem",
          }}
        >
          <p className="text-white text-sm">{message}</p>
          {link && (
            <a
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:text-primary-hover underline text-sm break-all"
            >
              {link.text}
            </a>
          )}

          <button
            onClick={onClose}
            className={`mt-2 w-full py-3 rounded-lg font-bold shadow-lg hover:shadow-xl transition-all transform hover:-translate-y-0.5 ${
              isSuccess
                ? "bg-gradient-to-r from-success to-green-600 hover:from-green-600 hover:to-green-700 text-white-fixed"
                : "bg-gradient-to-r from-danger to-red-600 hover:from-red-600 hover:to-red-700 text-white-fixed"
            }`}
          >
            {isSuccess ? t('done') : t('close')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AlertDialog;

