import { useEffect, useState } from 'react';
import { Github, Linkedin, X } from 'lucide-react';
import { cn } from '../../lib/utils';

export default function TeamModal({ member, onClose }) {
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    if (!member) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const frame = window.requestAnimationFrame(() => setEntered(true));

    const onEsc = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', onEsc);

    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onEsc);
    };
  }, [member, onClose]);

  useEffect(() => {
    if (!member) {
      setEntered(false);
    }
  }, [member]);

  if (!member) return null;

  return (
    <div
      className={cn(
        'fixed inset-0 z-[220] overflow-y-auto overscroll-contain bg-black/65 backdrop-blur-md transition-opacity duration-200',
        entered ? 'opacity-100' : 'opacity-0'
      )}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`${member.name} details`}
    >
      <div className="flex min-h-full items-center justify-center p-4">
        <div
          className={cn(
            'relative w-full max-w-md rounded-3xl border border-white/20',
            'bg-gradient-to-br from-slate-900/85 via-slate-900/75 to-black/70 p-6 text-slate-100 backdrop-blur-2xl',
            'shadow-[0_20px_60px_rgba(15,23,42,0.55)] transition-all duration-200',
            entered ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
          )}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            onClick={onClose}
            className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-white/10 text-slate-100 transition-colors hover:bg-white/20"
            aria-label="Close team member details"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="flex flex-col items-center text-center">
            <img
              src={member.image}
              alt={member.name}
              className="h-32 w-32 rounded-full border border-cyan-200/40 object-cover ring-4 ring-cyan-300/35"
            />

            <h3 className="mt-4 font-mono text-2xl font-bold">{member.name}</h3>
            <p className="mt-1 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs uppercase tracking-wide text-slate-200">
              {member.role}
            </p>

            <p className="mt-4 text-sm leading-relaxed text-slate-300">{member.bio}</p>

            <div className="mt-6 flex items-center gap-3">
              <a
                href={member.github}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/20 bg-white/10 transition-colors hover:bg-white/20"
                aria-label={`${member.name} GitHub`}
              >
                <Github className="h-5 w-5" />
              </a>
              <a
                href={member.linkedin}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/20 bg-white/10 transition-colors hover:bg-white/20"
                aria-label={`${member.name} LinkedIn`}
              >
                <Linkedin className="h-5 w-5" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
