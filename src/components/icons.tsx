"use client";

type P = { className?: string };
const base = "w-[18px] h-[18px] shrink-0 fill-none stroke-current stroke-[1.7] stroke-linecap-round stroke-linejoin-round";

export const IconHome = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={`${base} ${className || ""}`}><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h5v-6h4v6h5V9.5" /></svg>
);
export const IconPeople = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={`${base} ${className || ""}`}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.8-3.2 3.4-5 6.5-5s5.7 1.8 6.5 5" /><circle cx="17" cy="9" r="2.6" /><path d="M16.5 15.2c2.3.3 4 1.8 4.7 4.3" /></svg>
);
export const IconProject = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={`${base} ${className || ""}`}><path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" /></svg>
);
export const IconMeeting = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={`${base} ${className || ""}`}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>
);
export const IconTask = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={`${base} ${className || ""}`}><rect x="4" y="4" width="16" height="16" rx="3" /><path d="m8.5 12.5 2.5 2.5 4.5-5.5" /></svg>
);
export const IconNote = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={`${base} ${className || ""}`}><path d="M6 3h9l4 4v14H6Z" /><path d="M14 3v5h5M9 13h6M9 17h6" /></svg>
);
export const IconChat = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={`${base} ${className || ""}`}><path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-5 4Z" /></svg>
);
export const IconClip = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={`${base} ${className || ""}`}><path d="m8 12.5 6.5-6.5a2.8 2.8 0 0 1 4 4L11 17.5a4.6 4.6 0 0 1-6.5-6.5L12 3.5" /></svg>
);
export const IconMic = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={`${base} ${className || ""}`}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
);
export const IconStop = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={`${base} ${className || ""}`}><rect x="7" y="7" width="10" height="10" rx="2" /></svg>
);
export const IconSend = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={`${base} ${className || ""}`}><path d="M4 12 20 4l-4 8 4 8Z" /><path d="M11 13.5 20 4" /></svg>
);
export const IconSearch = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={`${base} ${className || ""}`}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.6-3.6" /></svg>
);
export const IconChip = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={`${base} ${className || ""}`}><rect x="5" y="5" width="14" height="14" rx="2.5" /><rect x="9" y="9" width="6" height="6" rx="1" /><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3" /></svg>
);
export const IconSun = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={`${base} ${className || ""}`}><circle cx="12" cy="12" r="4" /><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" /></svg>
);
export const IconMoon = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={`${base} ${className || ""}`}><path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z" /></svg>
);
export const IconBack = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={`${base} ${className || ""}`}><path d="M15 5l-7 7 7 7" /></svg>
);
export const IconDots = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={`${base} ${className || ""}`}><circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" /></svg>
);
export const IconFile = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={`${base} ${className || ""}`}><path d="M6 3h9l4 4v14H6Z" /><path d="M14 3v5h5" /></svg>
);
export const IconDownload = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={`${base} ${className || ""}`}><path d="M12 4v11m0 0 4-4m-4 4-4-4" /><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /></svg>
);
export const IconTrash = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={`${base} ${className || ""}`}><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m3 0-1 13a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1L6 7" /></svg>
);
export const IconPencil = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={`${base} ${className || ""}`}><path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17v3Z" /><path d="M14 6l4 4" /></svg>
);
export const IconUpload = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={`${base} ${className || ""}`}><path d="M12 16V4m0 0 4 4m-4-4L8 8" /><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" /></svg>
);
export const IconPlus = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={`${base} ${className || ""}`}><path d="M12 5v14M5 12h14" /></svg>
);
export const IconCheck = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={`${base} ${className || ""}`}><path d="m4.5 12.5 5 5 10-11" /></svg>
);
export const IconX = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={`${base} ${className || ""}`}><path d="M6 6l12 12M18 6 6 18" /></svg>
);
export const IconAccounts = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={`${base} ${className || ""}`}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18M7 15h3" /></svg>
);
export const IconSettings = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={`${base} ${className || ""}`}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
);
