import { useEffect, useRef, useState } from "react";

interface FollowEyesCharacterProps {
  size?: number;
}

export const FollowEyesCharacter = ({ size = 48 }: FollowEyesCharacterProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [leftPupil, setLeftPupil] = useState({ x: 0, y: 0 });
  const [rightPupil, setRightPupil] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      // Calculate angle to mouse
      const angle = Math.atan2(e.clientY - centerY, e.clientX - centerX);

      // Maximum pupil movement (in pixels)
      const maxMove = size * 0.08;

      // Calculate pupil positions
      const pupilX = Math.cos(angle) * maxMove;
      const pupilY = Math.sin(angle) * maxMove;

      setLeftPupil({ x: pupilX, y: pupilY });
      setRightPupil({ x: pupilX, y: pupilY });
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [size]);

  const eyeSize = size * 0.28;
  const pupilSize = size * 0.12;

  return (
    <div
      ref={containerRef}
      className="relative flex items-center justify-center transition-transform hover:scale-110"
      style={{ width: size, height: size * 1.4 }}
    >
      {/* Cello body - figure-8 shape */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {/* Upper bout */}
        <div
          className="absolute top-[5%] bg-gradient-to-br from-primary via-primary/90 to-primary/80 shadow-lg"
          style={{
            width: size * 0.65,
            height: size * 0.55,
            borderRadius: '50% 50% 48% 48% / 55% 55% 45% 45%',
            animation: "gentle-sway 3s ease-in-out infinite",
          }}
        />

        {/* C-bout (waist) */}
        <div
          className="absolute top-[38%] bg-gradient-to-br from-primary/95 via-primary/85 to-primary/75"
          style={{
            width: size * 0.45,
            height: size * 0.25,
            borderRadius: '45% 45% 45% 45% / 50% 50% 50% 50%',
          }}
        />

        {/* Lower bout */}
        <div
          className="absolute top-[55%] bg-gradient-to-br from-primary via-primary/90 to-primary/80 shadow-lg"
          style={{
            width: size * 0.75,
            height: size * 0.65,
            borderRadius: '48% 48% 50% 50% / 45% 45% 55% 55%',
            animation: "gentle-sway 3s ease-in-out infinite 0.15s",
          }}
        />

        {/* Strings */}
        <div className="absolute top-[8%] bottom-[8%] left-1/2 -translate-x-1/2 flex gap-[2px]" style={{ width: size * 0.2 }}>
          <div className="w-[1px] h-full bg-amber-900/40" />
          <div className="w-[1px] h-full bg-amber-900/40" />
          <div className="w-[1px] h-full bg-amber-900/40" />
          <div className="w-[1px] h-full bg-amber-900/40" />
        </div>

        {/* Bridge */}
        <div
          className="absolute top-[58%] left-1/2 -translate-x-1/2 bg-amber-800/60"
          style={{
            width: size * 0.22,
            height: size * 0.06,
            borderRadius: '20% 20% 40% 40%',
          }}
        />
      </div>

      {/* Face container on upper bout */}
      <div className="absolute top-[15%] left-1/2 -translate-x-1/2 z-10 flex flex-col items-center justify-center">
        {/* Eyes container */}
        <div className="flex gap-[12px] items-center justify-center">
          {/* Left eye */}
          <div
            className="relative bg-white rounded-full shadow-inner"
            style={{ width: eyeSize, height: eyeSize }}
          >
            {/* Left pupil */}
            <div
              className="absolute top-1/2 left-1/2 bg-gray-900 rounded-full transition-transform duration-100 ease-out"
              style={{
                width: pupilSize,
                height: pupilSize,
                transform: `translate(calc(-50% + ${leftPupil.x}px), calc(-50% + ${leftPupil.y}px))`,
              }}
            >
              {/* Shine effect */}
              <div
                className="absolute bg-white rounded-full"
                style={{
                  width: pupilSize * 0.35,
                  height: pupilSize * 0.35,
                  top: '20%',
                  left: '20%',
                }}
              />
            </div>
          </div>

          {/* Right eye */}
          <div
            className="relative bg-white rounded-full shadow-inner"
            style={{ width: eyeSize, height: eyeSize }}
          >
            {/* Right pupil */}
            <div
              className="absolute top-1/2 left-1/2 bg-gray-900 rounded-full transition-transform duration-100 ease-out"
              style={{
                width: pupilSize,
                height: pupilSize,
                transform: `translate(calc(-50% + ${rightPupil.x}px), calc(-50% + ${rightPupil.y}px))`,
              }}
            >
              {/* Shine effect */}
              <div
                className="absolute bg-white rounded-full"
                style={{
                  width: pupilSize * 0.35,
                  height: pupilSize * 0.35,
                  top: '20%',
                  left: '20%',
                }}
              />
            </div>
          </div>
        </div>

        {/* Mouth - cute smile */}
        <div
          className="mt-2 border-b-2 border-white/70 rounded-b-full"
          style={{
            width: size * 0.28,
            height: size * 0.12,
            borderBottomWidth: size * 0.04,
          }}
        />
      </div>

      {/* F-holes (decorative, below the face) */}
      <div className="absolute top-[35%] left-[35%] w-[8%] h-[12%] border-2 border-amber-900/30 rounded-full" style={{ transform: 'rotate(-5deg)' }} />
      <div className="absolute top-[35%] right-[35%] w-[8%] h-[12%] border-2 border-amber-900/30 rounded-full" style={{ transform: 'rotate(5deg)' }} />

      {/* Blush marks */}
      <div className="absolute left-[20%] top-[23%] w-[12%] h-[8%] bg-primary-foreground/20 rounded-full blur-[1px]" />
      <div className="absolute right-[20%] top-[23%] w-[12%] h-[8%] bg-primary-foreground/20 rounded-full blur-[1px]" />

      <style>{`
        @keyframes gentle-sway {
          0%, 100% {
            transform: rotate(-0.5deg);
          }
          50% {
            transform: rotate(0.5deg);
          }
        }
      `}</style>
    </div>
  );
};
