import { memo, useEffect, useRef } from 'react';

interface TankRingProps {
  current: number;
  target: number;
  size?: number;
  strokeWidth?: number;
  showLabel?: boolean;
  className?: string;
}

export default memo(function TankRing({
  current,
  target,
  size = 64,
  strokeWidth = 5,
  showLabel = true,
  className = '',
}: TankRingProps) {
  const circleRef = useRef<SVGCircleElement>(null);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(current / target, 1);
  const dashOffset = circumference * (1 - progress);

  useEffect(() => {
    const circle = circleRef.current;
    if (!circle) return;

    circle.style.strokeDasharray = `${circumference}`;
    circle.style.strokeDashoffset = `${circumference}`;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        circle.style.strokeDashoffset = `${dashOffset}`;
      });
    });
  }, [circumference, dashOffset]);

  const ringColor = progress >= 1
    ? 'stroke-navy-600'
    : progress >= 0.7
    ? 'stroke-cyan-500'
    : progress >= 0.4
    ? 'stroke-cyan-400'
    : 'stroke-amber-400';

  return (
    <div className={`relative inline-flex items-center justify-center ${className}`}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="transform -rotate-90"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          className="tank-ring-track"
          strokeWidth={strokeWidth}
          fill="none"
        />
        {progress > 0 && (
          <>
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              className="tank-ring-pulse"
              strokeWidth={strokeWidth + 4}
              fill="none"
              style={{
                strokeDasharray: circumference,
                strokeDashoffset: dashOffset,
                opacity: progress > 0.3 ? 0.3 : 0,
              }}
            />
            <circle
              ref={circleRef}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              className={`tank-ring-fill ${ringColor}`}
              strokeWidth={strokeWidth}
              fill="none"
            />
          </>
        )}
      </svg>
      {showLabel && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display font-bold text-navy-900 dark:text-surface-100" style={{ fontSize: size * 0.22 }}>
            {current}
          </span>
          {size >= 48 && (
            <span className="font-body text-surface-500 dark:text-surface-400" style={{ fontSize: size * 0.14 }}>
              / {target}
            </span>
          )}
        </div>
      )}
    </div>
  );
});
