export function DynamicBackground() {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden">
      {/* Combined high-performance background layer (zero performance overhead, no multi-layer composite) */}
      <div 
        className="absolute inset-0"
        style={{
          background: `
            radial-gradient(circle at 25% 25%, hsl(var(--primary) / 0.08) 0%, transparent 55%),
            radial-gradient(circle at 75% 65%, hsl(var(--accent) / 0.05) 0%, transparent 55%),
            radial-gradient(circle at 66% 50%, hsl(var(--secondary) / 0.08) 0%, transparent 45%),
            radial-gradient(circle at 50% 50%, hsl(var(--primary) / 0.03) 0%, transparent 70%),
            linear-gradient(135deg, hsl(var(--background)) 0%, hsl(var(--background)) 50%, hsl(var(--background) / 0.95) 100%)
          `
        }}
      />

      {/* Grid overlay */}
      <div
        className="absolute inset-0 opacity-[0.015]"
        style={{
          backgroundImage: `
            linear-gradient(hsl(var(--muted-foreground)) 1px, transparent 1px),
            linear-gradient(90deg, hsl(var(--muted-foreground)) 1px, transparent 1px)
          `,
          backgroundSize: '60px 60px',
        }}
      />
    </div>
  )
}
