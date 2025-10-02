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
      style={{ width: size, height: size }}
    >
      {/* Character body - cute blob shape */}
      <div
        className="absolute inset-0 rounded-full bg-gradient-to-br from-primary via-primary/90 to-primary/80 shadow-lg"
        style={{
          animation: "blob 4s ease-in-out infinite",
        }}
      />

      {/* Face container */}
      <div className="relative z-10 flex items-center justify-center w-full h-full">
        {/* Eyes container */}
        <div className="flex gap-[20%] items-center justify-center" style={{ width: '60%' }}>
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
      </div>

      {/* Mouth - cute smile */}
      <div
        className="absolute bottom-[22%] left-1/2 -translate-x-1/2 w-[35%] h-[15%] border-b-2 border-white/70 rounded-b-full"
        style={{
          borderBottomWidth: size * 0.04,
        }}
      />

      {/* Blush marks */}
      <div className="absolute left-[8%] top-[55%] w-[18%] h-[12%] bg-primary-foreground/20 rounded-full blur-[1px]" />
      <div className="absolute right-[8%] top-[55%] w-[18%] h-[12%] bg-primary-foreground/20 rounded-full blur-[1px]" />

      <style>{`
        @keyframes blob {
          0%, 100% {
            border-radius: 60% 40% 30% 70% / 60% 30% 70% 40%;
          }
          50% {
            border-radius: 30% 60% 70% 40% / 50% 60% 30% 60%;
          }
        }
      `}</style>
    </div>
  );
};
