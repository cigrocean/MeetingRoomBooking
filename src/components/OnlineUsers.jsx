import React from 'react';
import { useOthers } from '../liveblocks.config';
import { getTranslation } from '../utils/translations';
import { useLanguage } from '../hooks/useLanguage';

const OnlineUsers = () => {
  const { language } = useLanguage();
  const t = (key, params) => getTranslation(key, language, params);
  
  // useOthers returns the list of other users in the room
  const others = useOthers();
  const count = others.length + 1; // +1 for me

  return (
    <div className="flex items-center gap-1.5 bg-surface-alt/50 p-2 rounded-full border border-white/5 backdrop-blur-sm">
      <div className="relative flex h-2.5 w-2.5">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-success"></span>
      </div>
      <span className="text-xs sm:text-sm font-medium text-muted">
        {t('onlineUsers', { count })}
      </span>
    </div>
  );
};

export default OnlineUsers;
