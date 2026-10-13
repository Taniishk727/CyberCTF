import { useCallback, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import TeamCard from './TeamCard';
import TeamModal from './TeamModal';

const CARD_SCROLL_STEP = 300;

export default function TeamCarousel({ members }) {
  const scrollerRef = useRef(null);
  const [selectedMember, setSelectedMember] = useState(null);
  const closeMember = useCallback(() => setSelectedMember(null), []);
  const dragStateRef = useRef({
    active: false,
    startX: 0,
    startScrollLeft: 0,
    moved: false
  });

  const scrollByDirection = (direction) => {
    const el = scrollerRef.current;
    if (!el) return;

    el.scrollBy({
      left: direction * CARD_SCROLL_STEP,
      behavior: 'smooth'
    });
  };

  const onPointerDown = (event) => {
    const el = scrollerRef.current;
    if (!el) return;

    dragStateRef.current = {
      active: true,
      startX: event.clientX,
      startScrollLeft: el.scrollLeft,
      moved: false
    };

    el.setPointerCapture?.(event.pointerId);
  };

  const onPointerMove = (event) => {
    const el = scrollerRef.current;
    if (!el || !dragStateRef.current.active) return;

    const dx = event.clientX - dragStateRef.current.startX;
    if (Math.abs(dx) > 6) {
      dragStateRef.current.moved = true;
    }

    el.scrollLeft = dragStateRef.current.startScrollLeft - dx;
  };

  const onPointerUp = (event) => {
    const el = scrollerRef.current;
    if (!el) return;

    dragStateRef.current.active = false;
    el.releasePointerCapture?.(event.pointerId);
  };

  const onCardClick = (member) => {
    if (dragStateRef.current.moved) return;
    setSelectedMember(member);
  };

  return (
    <section className="relative overflow-hidden">
      <button
        type="button"
        onClick={() => scrollByDirection(-1)}
        className="absolute -left-1 top-1/2 z-20 -translate-y-1/2 rounded-full border border-white/20 bg-black/30 p-2 text-slate-100 backdrop-blur-xl transition-colors hover:bg-black/45 md:-left-5"
        aria-label="Scroll left"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>

      <div
        ref={scrollerRef}
        className="flex gap-4 overflow-x-auto px-8 py-2 touch-pan-x [&::-webkit-scrollbar]:hidden"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {members.map((member) => (
          <TeamCard
            key={member.name}
            member={member}
            onOpen={() => onCardClick(member)}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={() => scrollByDirection(1)}
        className="absolute -right-1 top-1/2 z-20 -translate-y-1/2 rounded-full border border-white/20 bg-black/30 p-2 text-slate-100 backdrop-blur-xl transition-colors hover:bg-black/45 md:-right-5"
        aria-label="Scroll right"
      >
        <ChevronRight className="h-5 w-5" />
      </button>

      <TeamModal member={selectedMember} onClose={closeMember} />
    </section>
  );
}
